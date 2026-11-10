// Typed service keys (architecture §4.7). A subsystem publishes what others
// read through a key that carries the value's type, instead of a stringly
// typed bag: `ctx.services.provide(HeightFogState, state)` and
// `ctx.services.get(HeightFogState)` agree on the type by construction.
//
// Keys are compared by identity, not by name: two features cannot collide by
// picking the same name. The name is for messages.

export interface ServiceKey<T> {
  readonly kind: "serviceKey";
  /** For messages only. */
  readonly name: string;
  /** Carries the value type; never set. */
  readonly type?: T;
}

export function createServiceKey<T>(name: string): ServiceKey<T> {
  return Object.freeze({ kind: "serviceKey", name }) as ServiceKey<T>;
}

export interface Services {
  /** Publishes a value; a key is provided once per world. */
  provide<T>(key: ServiceKey<T>, value: T): void;
  get<T>(key: ServiceKey<T>): T | undefined;
  /** Like `get`, but a missing service is an error. */
  require<T>(key: ServiceKey<T>): T;
}

export class ServiceError extends Error {}

/** A service table for one world. Not shared: each world makes its own. */
export function createServices(): Services {
  const values = new Map<ServiceKey<unknown>, unknown>();
  return {
    provide(key, value) {
      if (values.has(key)) throw new ServiceError(`Service "${key.name}" is already provided.`);
      values.set(key, value);
    },
    get<T>(key: ServiceKey<T>) {
      return values.get(key) as T | undefined;
    },
    require<T>(key: ServiceKey<T>) {
      if (!values.has(key)) throw new ServiceError(`Service "${key.name}" is not provided.`);
      return values.get(key) as T;
    },
  };
}
