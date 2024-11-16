import { Result, StatusError } from "@kardell/result";
import Joi, { SchemaLike } from "joi";

export type Request<P = unknown, B = unknown, Q = unknown> = {
  params?: P;
  body?: B;
  query?: Q;
};

export type APISchema<P = any, B = any, Q = any> = {
  params?: { [index in keyof P]: SchemaLike };
  body?: { [index in keyof B]: SchemaLike };
  query?: { [index in keyof Q]: SchemaLike };
};

const validate = (data: unknown, schema?: Joi.AnySchema): Result<any> => {
  if (!schema) {
    return Result.of(data);
  }
  const res = schema.validate(data);
  if (res.error) {
    return Result.failure(
      StatusError.BadRequest().withDetails(res.error.message)
    );
  }
  return Result.of(res.value);
};

export type ValidationFunc<T> = (
  data: Request<unknown, unknown, unknown>
) => Result<T>;

export const validator = <P = any, B = any, Q = any>(
  pmsSchema: APISchema<P, B, Q>
): ValidationFunc<Request<P, B, Q>> => {
  const schema = {
    params: pmsSchema.params ? Joi.object(pmsSchema.params) : Joi.any(),
    body: pmsSchema.body ? Joi.object(pmsSchema.body) : Joi.any(),
    query: pmsSchema.query ? Joi.object(pmsSchema.query) : Joi.any(),
  };
  return <T extends Request<unknown, unknown, unknown>>(
    data: Request<unknown, unknown, unknown>
  ): Result<T> => {
    const { data: body, error: bodyError } = validate(data.body, schema.body);
    if (bodyError) {
      console.log("bodyError", bodyError);
      return Result.failure(bodyError);
    }

    const { data: params, error: paramsError } = validate(
      data.params,
      schema.params
    );
    if (paramsError) {
      return Result.failure(paramsError);
    }

    const { data: query, error: queryError } = validate(
      data.query,
      schema.query
    );
    if (queryError) {
      return Result.failure(queryError);
    }
    return Result.of({ body, params, query } as T);
  };
};

export const noValidation = (
  data: Request<unknown, unknown, unknown>
): Result<Request<unknown, unknown, unknown>> => {
  return Result.of(data);
};
