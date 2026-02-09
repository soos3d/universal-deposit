export * from './chains';
export * from './tokens';

export const DEFAULT_JWT_SERVICE_URL = 'https://deposit-auth-worker.deposit-kit.workers.dev';
export const DEFAULT_DESTINATION_CHAIN_ID = 42161; // Arbitrum
// Low threshold to account for stablecoin price fluctuations (e.g., 0.5 USDC = $0.49985)
export const DEFAULT_MIN_VALUE_USD = 0.2;
export const DEFAULT_POLLING_INTERVAL_MS = 3000;

// Default Particle project credentials for the Deposit SDK
// These are used when devs don't provide their own credentials
export const DEFAULT_PROJECT_ID = '2e1612a2-5757-4026-82b1-e0a7a3a69698';
export const DEFAULT_CLIENT_KEY = 'cQRTw7Eqag5yHpa3iKkvwQ8J7qThRy1ZAqfPJwdy';
export const DEFAULT_APP_ID = '30c594e4-5615-49c9-89d6-86227f5e423e';
