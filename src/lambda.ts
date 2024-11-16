import { APIGatewayProxyEvent } from "aws-lambda";
import { ValidationFunc, Request } from "./validation";
import { Result, StatusError } from "@kardell/result";
import pino from "pino";

const baseLogger = pino();

type Response = {
  statusCode: number;
  body: string;
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

type Handler = (event: APIGatewayProxyEvent) => Promise<Response>;

const apiGatewayHandler = <T extends Request<unknown, unknown, unknown>, V>(
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
      body: event.body,
      params: event.pathParameters,
      query: event.queryStringParameters,
    };
    const { data: request, error } = validator(input);
    if (error) {
      return {
        statusCode: error.status,
        body: JSON.stringify(<ErrorMessage>{
          message: error.message,
          details: error.details,
        }),
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
        }),
        (e) => ({
          statusCode: e.status,
          body: JSON.stringify({ message: e.message }),
        })
      );
    } catch (e) {
      logger.error(`Uncontrolled error caught in wrapper ${e}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: StatusError.Internal().message }),
      };
    }
  };
};

export const handlers = {
  apiGateway: apiGatewayHandler,
};
