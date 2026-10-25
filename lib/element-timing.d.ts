// Element Timing API attribute (https://wicg.github.io/element-timing/), used by the perf harness.
import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    elementtiming?: string;
  }
}
