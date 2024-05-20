import { Transform, TransformCallback, TransformOptions } from "stream";

type HeaderHostTransformerOptions = TransformOptions & {
  host: string;
  port: number;
};

export class HeaderHostTransformer extends Transform {
  private readonly host: string;
  private replaced: boolean;

  constructor(opts: HeaderHostTransformerOptions) {
    super(opts);
    this.host = `${opts.host}:${opts.port}`;
    this.replaced = false;
  }

  override _transform(
    data: any,
    _: BufferEncoding,
    callback: TransformCallback
  ) {
    callback(
      null,
      this.replaced // after replacing the first instance of the Host header we just become a regular passthrough
        ? data
        : data
            .toString()
            .replace(/(\r\n[Hh]ost: )\S+/, (_: string, $1: string) => {
              this.replaced = true;
              return $1 + this.host;
            })
    );
  }
}
