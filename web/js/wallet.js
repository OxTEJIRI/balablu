// NEAR wallet, loaded only when someone wants real money (guests never pay for it).
import { NETWORK, CONTRACT } from './config.js';
import { emit } from './ui.js';

const V = '10.1.4';
let selector = null;
let modal = null;
let current = null;
try { current = localStorage.getItem('balablu.account'); } catch { /* ignore */ }

export const account = () => current;

async function load() {
  if (selector) return selector;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `https://cdn.jsdelivr.net/npm/@near-wallet-selector/modal-ui@${V}/styles.css`;
  document.head.appendChild(css);
  const [{ setupWalletSelector }, { setupModal }, { setupMeteorWallet }, { setupMyNearWallet }] = await Promise.all([
    import(`https://esm.sh/@near-wallet-selector/core@${V}`),
    import(`https://esm.sh/@near-wallet-selector/modal-ui@${V}`),
    import(`https://esm.sh/@near-wallet-selector/meteor-wallet@${V}`),
    import(`https://esm.sh/@near-wallet-selector/my-near-wallet@${V}`),
  ]);
  selector = await setupWalletSelector({ network: NETWORK, modules: [setupMeteorWallet(), setupMyNearWallet()] });
  modal = setupModal(selector, { contractId: CONTRACT, description: 'BalaBlu: bet on facts with real USDC.' });
  const sync = (state) => {
    const a = state.accounts.find((x) => x.active)?.accountId || state.accounts[0]?.accountId || null;
    if (a !== current) {
      current = a;
      try { a ? localStorage.setItem('balablu.account', a) : localStorage.removeItem('balablu.account'); } catch { /* ignore */ }
      emit('wallet', a);
    }
  };
  sync(selector.store.getState());
  selector.store.observable.subscribe(sync);
  return selector;
}

/** Restore a session on page load (cheap if never connected). */
export async function restore() {
  if (current) {
    try { await load(); } catch (e) { console.warn('wallet restore failed', e); }
  }
}

export async function signIn() {
  await load();
  modal.show();
}

export async function signOut() {
  await load();
  const w = await selector.wallet();
  await w.signOut();
  current = null;
  try { localStorage.removeItem('balablu.account'); } catch { /* ignore */ }
  emit('wallet', null);
}

const fc = (methodName, args, gas = '100000000000000', deposit = '0') => ({ type: 'FunctionCall', params: { methodName, args, gas, deposit } });

/** One call on a contract (default: BalaBlu). */
export async function call(method, args, { receiver = CONTRACT, deposit = '0', gas = '100000000000000' } = {}) {
  await load();
  if (!current) throw new Error('Connect a wallet first');
  const w = await selector.wallet();
  return w.signAndSendTransaction({ receiverId: receiver, actions: [fc(method, args, gas, deposit)] });
}

/** Several transactions in one wallet approval. txs: [{receiver, method, args, deposit, gas}] */
export async function callMany(txs) {
  await load();
  if (!current) throw new Error('Connect a wallet first');
  const w = await selector.wallet();
  return w.signAndSendTransactions({ transactions: txs.map((t) => ({ receiverId: t.receiver || CONTRACT, actions: [fc(t.method, t.args, t.gas || '100000000000000', t.deposit || '0')] })) });
}
