#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MarketplacePrototypeStack } from "../infra/marketplace-prototype-stack";

const app = new cdk.App();

new MarketplacePrototypeStack(app, "MarketplacePrototypeStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  }
});
