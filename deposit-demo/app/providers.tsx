"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { DepositProvider } from "@particle-network/deposit-sdk/react";

const PRIVY_APP_ID = "cmk42oyun0316ky0cwqf3abt7";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#3B82F6",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <DepositProvider
        config={{
          autoSweep: true,
          minValueUSD: 1,
        }}
      >
        {children}
      </DepositProvider>
    </PrivyProvider>
  );
}
