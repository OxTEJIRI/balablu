// Network settings. Mainnet: switch NETWORK, CONTRACT and USDC.
export const NETWORK = 'testnet';
export const CONTRACT = 'balabluapp.testnet';
export const USDC = 'usdc.balabluapp.testnet';
/** FastNEAR first (faster), the public NEAR RPC as fallback. */
export const RPCS = NETWORK === 'mainnet' ? ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'] : ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
export const RPC = RPCS[0];
export const EXPLORER = NETWORK === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io';
/** Signed AI replies and pages are committed to the repo; read them raw. */
export const DATA = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/data' : 'https://raw.githubusercontent.com/OxTEJIRI/balablu/main/data';
export const REPO = 'https://github.com/OxTEJIRI/balablu';
export const ONE = 1_000_000;
