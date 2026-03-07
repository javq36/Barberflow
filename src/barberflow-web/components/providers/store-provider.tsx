"use client";

import { PropsWithChildren, useState } from "react";
import { Provider } from "react-redux";
import { AppStore, makeStore } from "@/lib/store";

export function StoreProvider({ children }: PropsWithChildren) {
  const [store] = useState<AppStore>(() => makeStore());

  return <Provider store={store}>{children}</Provider>;
}
