import cx from "classnames";
import type { NextPage } from "next";
import Head from "next/head";
import { ReplayDebugger } from "src/components/replay-debugger/replay-debugger";

const HomePage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Meticulous Debugger</title>
      </Head>
      <main className={cx("bg-zinc-100")}>
        <ReplayDebugger />
      </main>
    </>
  );
};

export default HomePage;
