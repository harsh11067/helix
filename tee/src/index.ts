// Boots all HELIX TEE HTTP workloads in one process for local dev / demo.
import { makeServer as compilerServer } from './compiler/server.ts';
import { makeServer as backtestServer } from './backtest/server.ts';
import { MOCK_TEE } from './shared/attestation.ts';

const compilerPort = Number(process.env.COMPILER_PORT ?? 8081);
const backtestPort = Number(process.env.BACKTEST_PORT ?? 8082);

compilerServer().listen(compilerPort, () => console.log(`[compiler] :${compilerPort}`));
backtestServer().listen(backtestPort, () => console.log(`[backtest] :${backtestPort}`));
console.log(`[helix-tee] up (mockTee=${MOCK_TEE})`);
