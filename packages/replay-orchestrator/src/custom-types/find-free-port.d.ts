declare module "find-free-port" {
  export default function findFreePort(start: number): Promise<[number]>;
}
