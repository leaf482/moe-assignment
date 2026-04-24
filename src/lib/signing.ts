import { createHmac, timingSafeEqual } from "node:crypto";

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string | undefined, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expected = signBody(body, secret);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
