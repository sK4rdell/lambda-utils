import { APIGatewayProxyEvent } from "aws-lambda";
import { ValidationFunc, Request } from "./validation";
import { Result, StatusError } from "@kardell/result";
import pino from "pino";

const baseLogger = pino();

type Response = {
  statusCode: number;
  body: string;
  headers: { [key: string]: string };
};

type ErrorMessage = {
  message: string;
  details: string | undefined;
};

export type LambdaInput<T> = {
  userID: string | undefined;
  requestID: string;
  logger: pino.Logger;
  data: T;
};

const parse = (data: any): unknown | null => {
  try {
    const res = JSON.parse(data);
    return res;
  } catch {
    return null;
  }
};

type Handler = (event: APIGatewayProxyEvent) => Promise<Response>;

const apiGatewayHandler = <
  T extends Request<unknown, unknown, unknown>,
  V = unknown
>(
  validator: ValidationFunc<T>,
  func: (req: LambdaInput<T>) => Promise<Result<V>>
): Handler => {
  return async (event: APIGatewayProxyEvent): Promise<Response> => {
    const logger = baseLogger.child({
      requestID:
        event.requestContext.extendedRequestId ??
        event.requestContext.requestId,
    });
    const input: Request<unknown, unknown, unknown> = {
      body: parse(event.body) ?? {},
      params: event.pathParameters ?? {},
      query: event.queryStringParameters ?? {},
    };
    const { data: request, error } = validator(input);
    if (error) {
      return {
        statusCode: error.status,
        body: JSON.stringify(<ErrorMessage>{
          message: error.message,
          details: error.details,
        }),
        headers: { ["content-type"]: "application/json" },
      };
    }
    try {
      const input: LambdaInput<T> = {
        userID: event.requestContext.authorizer?.iam.cognitoIdentity.identityId,
        requestID: event.requestContext.requestId,
        data: request,
        logger,
      };
      const res = await func(input);
      return res.fold<Response, Response>(
        (value) => ({
          statusCode: 200,
          body: JSON.stringify(value),
          headers: { ["content-type"]: "application/json" },
        }),
        (e) => ({
          statusCode: e.status,
          body: JSON.stringify({ message: e.message }),
          headers: { ["content-type"]: "application/json" },
        })
      );
    } catch (e) {
      logger.error(`Uncontrolled error caught in wrapper ${e}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: StatusError.Internal().message }),
        headers: { ["content-type"]: "application/json" },
      };
    }
  };
};

export const handlers = {
  apiGateway: apiGatewayHandler,
};
