// rpcFacade — a small JSON-RPC surface (`/rpc` testnet, `/rpc-main` mainnet) for
// tools and checks that still speak `sui_*`. Sui retired JSON-RPC on public
// fullnodes and Tatum's gateway serves GraphQL, so each allowed method is
// translated to a Tatum GraphQL query. Anything not on the allowlist is refused
// (403 + JSON-RPC error), and mainnet is read-only.

import { gql, type Net, recordExecution } from './tatum.ts';
import { HttpError } from './http.ts';
import { executeSigned } from '../predict/predict.ts';

const READ = new Set([
  'sui_getLatestCheckpointSequenceNumber', 'sui_getObject', 'sui_multiGetObjects',
  'sui_getTransactionBlock', 'sui_getNormalizedMoveModulesByPackage', 'rpc.discover',
]);
const WRITE_TESTNET = new Set(['sui_executeTransactionBlock']);

export function allowed(net: Net, method: string): boolean {
  return READ.has(method) || (net === 'testnet' && WRITE_TESTNET.has(method));
}

const OBJ_Q = `query($id: SuiAddress!) { object(address: $id) { address version digest
  owner { __typename ... on AddressOwner { address { address } } ... on Shared { initialSharedVersion } }
  asMoveObject { contents { type { repr } json } } asMovePackage { modules(first: 50) { nodes { name } } } } }`;

function objectResult(o: any, showContent: boolean) {
  if (!o) return { error: { code: 'notExists' } };
  const isPkg = !!o.asMovePackage;
  const owner = o.owner?.__typename === 'AddressOwner' ? { AddressOwner: o.owner.address?.address }
    : o.owner?.__typename === 'Shared' ? { Shared: { initial_shared_version: o.owner.initialSharedVersion } }
    : o.owner?.__typename ?? null;
  return {
    data: {
      objectId: o.address, version: String(o.version), digest: o.digest,
      type: isPkg ? 'package' : o.asMoveObject?.contents?.type?.repr, owner,
      ...(showContent && !isPkg ? { content: { dataType: 'moveObject', type: o.asMoveObject?.contents?.type?.repr, fields: o.asMoveObject?.contents?.json } } : {}),
      ...(isPkg ? { modules: o.asMovePackage.modules.nodes.map((n: any) => n.name) } : {}),
    },
  };
}

async function call(net: Net, method: string, params: any[]): Promise<unknown> {
  switch (method) {
    case 'rpc.discover':
      return { methods: [...READ, ...(net === 'testnet' ? WRITE_TESTNET : [])], transport: `Tatum Sui ${net} GraphQL` };
    case 'sui_getLatestCheckpointSequenceNumber': {
      const r = await gql(net, '{ checkpoint { sequenceNumber } }');
      return String(r.data?.checkpoint?.sequenceNumber);
    }
    case 'sui_getObject': {
      const r = await gql(net, OBJ_Q, { id: params[0] });
      return objectResult(r.data?.object, !!params[1]?.showContent);
    }
    case 'sui_multiGetObjects': {
      const ids: string[] = (params[0] ?? []).slice(0, 25);
      return Promise.all(ids.map(async (id) => objectResult((await gql(net, OBJ_Q, { id })).data?.object, !!params[1]?.showContent)));
    }
    case 'sui_getTransactionBlock': {
      const r = await gql(net, `query($d: String!) { transaction(digest: $d) { digest sender { address }
        effects { status timestamp checkpoint { sequenceNumber } } } }`, { d: params[0] });
      const t = r.data?.transaction;
      if (!t) throw new HttpError(200, null);
      return {
        digest: t.digest, transaction: { data: { sender: t.sender?.address } },
        effects: { status: { status: t.effects?.status === 'SUCCESS' ? 'success' : 'failure' } },
        timestampMs: t.effects?.timestamp ? String(Date.parse(t.effects.timestamp)) : null,
        checkpoint: t.effects?.checkpoint?.sequenceNumber != null ? String(t.effects.checkpoint.sequenceNumber) : null,
      };
    }
    case 'sui_getNormalizedMoveModulesByPackage': {
      const r = await gql(net, `query($id: SuiAddress!) { package(address: $id) { modules(first: 50) { nodes { name } } } }`, { id: params[0] });
      const mods = r.data?.package?.modules?.nodes ?? [];
      return Object.fromEntries(mods.map((m: any) => [m.name, { name: m.name, address: params[0] }]));
    }
    case 'sui_executeTransactionBlock': {
      const [txBytes, sigs] = params;
      const res = await executeSigned(txBytes, Array.isArray(sigs) ? sigs : [sigs]);
      const tx = res.Transaction ?? res.FailedTransaction ?? res;
      if (tx?.digest) recordExecution('testnet', tx.digest);
      return { digest: tx?.digest, effects: { status: { status: tx?.effects?.status?.success ? 'success' : 'failure', error: tx?.effects?.status?.error } } };
    }
  }
  throw new Error('unreachable');
}

export async function handleRpc(net: Net, body: any): Promise<unknown> {
  const id = body?.id ?? null;
  const method = String(body?.method ?? '');
  if (!allowed(net, method)) {
    throw new HttpError(403, {
      jsonrpc: '2.0', id,
      error: { code: -32601, message: net === 'mainnet' && WRITE_TESTNET.has(method) ? 'mainnet proxy is read-only' : `method not allowed: ${method}` },
    });
  }
  try {
    return { jsonrpc: '2.0', id, result: await call(net, method, Array.isArray(body.params) ? body.params : []) };
  } catch (e) {
    if (e instanceof HttpError && e.body === null) return { jsonrpc: '2.0', id, result: null };
    return { jsonrpc: '2.0', id, error: { code: -32000, message: (e as Error).message.slice(0, 300) } };
  }
}
