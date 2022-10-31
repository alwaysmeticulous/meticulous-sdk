// See https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/
// for more details

export type StringId<FlavorT> = Flavor<string, FlavorT>;

export type Flavor<T, FlavorT> = T & {
  _type?: FlavorT;
};
