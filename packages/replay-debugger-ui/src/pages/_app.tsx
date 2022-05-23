import type { AppProps } from "next/app";
import Head from "next/head";
import { FunctionComponent, StrictMode } from "react";
import "src/style/global.css";

const MyApp: FunctionComponent<AppProps> = ({
  Component: Component_,
  pageProps,
}) => {
  const Component = Component_ as any;

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        ></meta>
      </Head>
      <StrictMode>
        <Component {...pageProps} />
      </StrictMode>
    </>
  );
};

export default MyApp;
