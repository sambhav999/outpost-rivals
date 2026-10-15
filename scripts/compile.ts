import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export function compile() {
  const sources = Object.fromEntries(
    ["OutpostStore.sol", "MockToken.sol"].map((n) => [
      n,
      { content: readFileSync(resolve("contracts", n), "utf8") },
    ]),
  );
  const result = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "shanghai",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
      {
        import: (p: string) => {
          try {
            return {
              contents: readFileSync(resolve("node_modules", p), "utf8"),
            };
          } catch {
            return { error: "Missing import " + p };
          }
        },
      },
    ),
  );
  if (result.errors?.some((e: any) => e.severity === "error"))
    throw Error(result.errors.map((e: any) => e.formattedMessage).join("\n"));
  mkdirSync("artifacts", { recursive: true });
  const out: any = {};
  for (const [file, contracts] of Object.entries(result.contracts) as any) {
    if (!sources[file]) continue;
    for (const [name, c] of Object.entries(contracts) as any) {
      out[name] = {
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object,
        compiler: solc.version(),
      };
      writeFileSync(
        `artifacts/${name}.json`,
        JSON.stringify(out[name], null, 2),
      );
    }
  }
  return out;
}
if (process.argv[1]?.endsWith("/compile.ts")) {
  compile();
  console.log("Contracts compiled");
}
