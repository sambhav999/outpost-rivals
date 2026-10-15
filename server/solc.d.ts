declare module "solc" {
  const solc: {
    compile: (input: string, callbacks?: any) => string;
    version: () => string;
  };
  export default solc;
}
