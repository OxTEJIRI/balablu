#!/usr/bin/env bash
# BalaBlu full loop on NEAR testnet, using near-cli-rs and the legacy keychain.
#   NEAR=/path/to/near ./scripts/testnet-loop.sh
# Needs: balabluapp.testnet key in ~/.near-credentials, wasm files in $WASM_DIR.
set -euo pipefail
NEAR=${NEAR:-near}
NET=testnet
APP=${APP:-balabluapp.testnet}
USDC=${USDC:-usdc.$APP}
PLAYER=${PLAYER:-player1.$APP}
OWNER=${OWNER:-admin.$APP}   # admin account (the contract account cannot send USDC to itself)
WASM_DIR=${WASM_DIR:-./dist}

tx() { # tx <contract> <method> <json> <signer> [deposit]
  "$NEAR" contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '100 Tgas' \
    attached-deposit "${5:-0 NEAR}" sign-as "$4" network-config $NET sign-with-legacy-keychain send 2>&1 \
    | grep -E "succeeded|Error|error|panicked|Smart contract" | head -3
}
view() { # view <contract> <method> <json>
  "$NEAR" contract call-function as-read-only "$1" "$2" json-args "$3" network-config $NET now 2>/dev/null
}
exists() { "$NEAR" account view-account-summary "$1" network-config $NET now >/dev/null 2>&1; }

echo "== 1. test USDC token at $USDC"
if ! exists "$USDC"; then
  "$NEAR" account create-account fund-myself "$USDC" '3 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$APP" network-config $NET sign-with-legacy-keychain send 2>&1 | grep -E "created|Error" | head -2
  "$NEAR" contract deploy "$USDC" use-file "$WASM_DIR/mock_usdc.wasm" with-init-call new json-args '{}' \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-legacy-keychain send 2>&1 | grep -E "Error|error" || true
fi

echo "== 2. player $PLAYER and admin $OWNER accounts"
for A in "$PLAYER" "$OWNER"; do
  if ! exists "$A"; then
    "$NEAR" account create-account fund-myself "$A" '1 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
      sign-as "$APP" network-config $NET sign-with-legacy-keychain send 2>&1 | grep -E "created|Error" | head -2
  fi
done

echo "== 3. deploy BalaBlu (initialise only if the state is old or missing)"
"$NEAR" contract deploy "$APP" use-file "$WASM_DIR/balablu.wasm" without-init-call \
  network-config $NET sign-with-legacy-keychain send 2>&1 | grep -E "Error|error" || true
if ! view "$APP" owner '{}' | grep -q "\"$OWNER\""; then
  echo "-- old/missing state or other owner: reinit"
  tx "$APP" reinit "{\"owner\":\"$OWNER\",\"usdc_token\":\"$USDC\",\"max_bet_usdc\":\"2000000\"}" "$APP"
fi
view "$APP" get_config '{}'

echo "== 4. mint test USDC and deposit into BalaBlu wallets"
tx "$USDC" mint "{\"account_id\":\"$OWNER\",\"amount\":\"20000000\"}" "$OWNER"
tx "$USDC" mint "{\"account_id\":\"$PLAYER\",\"amount\":\"10000000\"}" "$PLAYER"
tx "$USDC" ft_transfer_call "{\"receiver_id\":\"$APP\",\"amount\":\"15000000\",\"msg\":\"\"}" "$OWNER" '1 yoctoNEAR'
tx "$USDC" ft_transfer_call "{\"receiver_id\":\"$APP\",\"amount\":\"6000000\",\"msg\":\"\"}" "$PLAYER" '1 yoctoNEAR'
view "$APP" get_wallet "{\"account_id\":\"$PLAYER\"}"

echo "== 5. create claims (seeded with 5 USDC each)"
tx "$APP" create_claim '{"page":"NEAR Protocol","text":"NEAR moved to community control in October 2020.","rule":"FACT if NEAR validators took over block production from the NEAR Foundation in October 2020 (the Phase 1 vote). BALABLU if it happened in another month or never.","sources":["https://near.org/blog/near-mainnet-is-now-community-operated"],"fact_odds_bps":8000,"usdc_seed":"5000000"}' "$OWNER"
tx "$APP" create_claim '{"page":"NEAR Protocol","text":"NEAR mainnet launched in 2018.","rule":"FACT if NEAR mainnet produced its first blocks in 2018. BALABLU otherwise.","sources":["https://near.org/blog/mainnet-phase-0"],"fact_odds_bps":3000,"usdc_seed":"5000000"}' "$OWNER"
view "$APP" claims_count '{}'
ID=$(( $(view "$APP" claims_count '{}' | tr -dc '0-9') - 1 ))
echo "claim under test: $ID"

echo "== 6. player: practice points + bets"
tx "$APP" claim_practice_points '{}' "$PLAYER" || true
view "$APP" quote_buy "{\"claim_id\":$ID,\"side\":\"Balablu\",\"currency\":\"Usdc\",\"amount\":\"2000000\"}"
tx "$APP" buy "{\"claim_id\":$ID,\"side\":\"Balablu\",\"currency\":\"Usdc\",\"amount\":\"2000000\"}" "$PLAYER"
tx "$APP" buy "{\"claim_id\":$ID,\"side\":\"Balablu\",\"currency\":\"Points\",\"amount\":\"200000000\"}" "$PLAYER"
echo "-- cap check (3 USDC must fail):"
tx "$APP" buy "{\"claim_id\":$ID,\"side\":\"Fact\",\"currency\":\"Usdc\",\"amount\":\"3000000\"}" "$PLAYER" || true
view "$APP" get_market "{\"claim_id\":$ID,\"currency\":\"Usdc\"}"

echo "== 7. settle (owner stand-in for the jury until Day 3) and redeem"
EP=$(view "$APP" get_claim "{\"claim_id\":$ID}" | python -c "import sys,json;print(json.load(sys.stdin)['epoch'])")
tx "$APP" settle_epoch "{\"claim_id\":$ID,\"outcome\":\"Balablu\"}" "$OWNER"
tx "$APP" redeem "{\"claim_id\":$ID,\"epoch\":$EP,\"currency\":\"Usdc\"}" "$PLAYER"
tx "$APP" redeem "{\"claim_id\":$ID,\"epoch\":$EP,\"currency\":\"Points\"}" "$PLAYER"
echo "-- double redeem (must fail):"
tx "$APP" redeem "{\"claim_id\":$ID,\"epoch\":$EP,\"currency\":\"Usdc\"}" "$PLAYER" || true
view "$APP" get_wallet "{\"account_id\":\"$PLAYER\"}"
view "$APP" get_market "{\"claim_id\":$ID,\"currency\":\"Points\"}"

echo "== 8. cash out 1 USDC back to the player's own wallet"
tx "$APP" withdraw_usdc '{"amount":"1000000"}' "$PLAYER" '1 yoctoNEAR'
view "$USDC" ft_balance_of "{\"account_id\":\"$PLAYER\"}"
view "$APP" get_wallet "{\"account_id\":\"$PLAYER\"}"
