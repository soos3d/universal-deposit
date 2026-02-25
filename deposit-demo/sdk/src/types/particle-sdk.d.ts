/**
 * Type declarations for @particle-network/universal-account-sdk
 * 
 * The SDK has types but they don't resolve correctly due to package.json exports.
 * This provides the minimal types we need.
 */

declare module '@particle-network/universal-account-sdk' {
  export interface UniversalAccountConfig {
    projectId: string;
    projectClientKey: string;
    projectAppUuid: string;
    ownerAddress: string;
    tradeConfig?: {
      slippageBps?: number;
      universalGas?: boolean;
    };
  }

  export interface SmartAccountOptions {
    evmSmartAccount?: string;
    smartAccountAddress?: string;
    solanaSmartAccount?: string;
    solanaSmartAccountAddress?: string;
  }

  export class UniversalAccount {
    constructor(config: UniversalAccountConfig);
    getSmartAccountOptions(): Promise<SmartAccountOptions>;
    getPrimaryAssets(): Promise<{ assets: any[] }>;
  }
}
