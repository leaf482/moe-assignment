import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodeLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class MarketplacePrototypeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const listingsTable = new dynamodb.Table(this, "ListingsTable", {
      partitionKey: { name: "listingId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const activityTable = new dynamodb.Table(this, "ActivityTable", {
      partitionKey: { name: "listingId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "activityId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const eventTable = new dynamodb.Table(this, "WebhookEventsTable", {
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const mockPublishTable = new dynamodb.Table(this, "MockPublishTable", {
      partitionKey: { name: "idempotencyKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const deadLetterQueue = new sqs.Queue(this, "PublishDeadLetterQueue", {
      retentionPeriod: Duration.days(14)
    });

    const publishQueue = new sqs.Queue(this, "PublishQueue", {
      visibilityTimeout: Duration.seconds(45),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 4
      }
    });

    const webhookSecret = `dev-webhook-secret-${this.account}-${this.region}`;

    const commonEnvironment = {
      LISTINGS_TABLE: listingsTable.tableName,
      ACTIVITY_TABLE: activityTable.tableName,
      WEBHOOK_EVENTS_TABLE: eventTable.tableName,
      MOCK_PUBLISH_TABLE: mockPublishTable.tableName,
      PUBLISH_QUEUE_URL: publishQueue.queueUrl,
      WEBHOOK_SECRET: webhookSecret
    };

    const handlerDefaults: Omit<nodeLambda.NodejsFunctionProps, "entry"> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(15),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: true
      },
      environment: commonEnvironment
    };

    const createListing = new nodeLambda.NodejsFunction(this, "CreateListingHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/create-listing.ts")
    });

    const listListings = new nodeLambda.NodejsFunction(this, "ListListingsHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/list-listings.ts")
    });

    const webhook = new nodeLambda.NodejsFunction(this, "WebhookHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/webhook.ts")
    });

    const mockPublish = new nodeLambda.NodejsFunction(this, "MockPublishHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/mock-publish.ts")
    });

    const mockEvents = new nodeLambda.NodejsFunction(this, "MockEventsHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/mock-events.ts")
    });

    const publisher = new nodeLambda.NodejsFunction(this, "PublisherHandler", {
      ...handlerDefaults,
      entry: path.join(__dirname, "../src/handlers/publisher.ts"),
      timeout: Duration.seconds(30)
    });

    listingsTable.grantReadWriteData(createListing);
    listingsTable.grantReadWriteData(listListings);
    listingsTable.grantReadWriteData(webhook);
    listingsTable.grantReadWriteData(mockEvents);
    listingsTable.grantReadWriteData(publisher);

    activityTable.grantReadWriteData(createListing);
    activityTable.grantReadWriteData(listListings);
    activityTable.grantReadWriteData(webhook);
    activityTable.grantReadWriteData(publisher);

    eventTable.grantReadWriteData(webhook);
    mockPublishTable.grantReadWriteData(mockPublish);
    publishQueue.grantSendMessages(createListing);
    publishQueue.grantConsumeMessages(publisher);

    publisher.addEventSourceMapping("PublishQueueEventSource", {
      eventSourceArn: publishQueue.queueArn,
      batchSize: 1
    });

    const api = new apigateway.RestApi(this, "MarketplaceApi", {
      restApiName: "marketplace-aggregator-prototype",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "X-Marketplace-Signature"]
      }
    });

    publisher.addEnvironment("MOCK_MARKETPLACE_URL", `${api.url}mock-marketplace/publish`);
    mockPublish.addEnvironment("WEBHOOK_URL", `${api.url}webhooks/marketplace`);
    mockEvents.addEnvironment("WEBHOOK_URL", `${api.url}webhooks/marketplace`);

    const listings = api.root.addResource("listings");
    listings.addMethod("POST", new apigateway.LambdaIntegration(createListing));
    listings.addMethod("GET", new apigateway.LambdaIntegration(listListings));

    const webhooks = api.root.addResource("webhooks");
    webhooks.addResource("marketplace").addMethod("POST", new apigateway.LambdaIntegration(webhook));

    const mockMarketplace = api.root.addResource("mock-marketplace");
    mockMarketplace.addResource("publish").addMethod("POST", new apigateway.LambdaIntegration(mockPublish));
    mockMarketplace.addResource("events").addMethod("POST", new apigateway.LambdaIntegration(mockEvents));

    const siteBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const apiOrigin = new origins.RestApiOrigin(api);
    const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        "listings*": {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        },
        "mock-marketplace/*": {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        }
      },
      defaultRootObject: "index.html"
    });

    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../dist/web")),
        s3deploy.Source.data("config.js", "window.APP_CONFIG = { apiUrl: \"/\" };\n")
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"]
    });

    new cdk.CfnOutput(this, "FrontendUrl", {
      value: `https://${distribution.distributionDomainName}`
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "PublishDlqUrl", { value: deadLetterQueue.queueUrl });
  }
}
