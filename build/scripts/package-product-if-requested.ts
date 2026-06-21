import { spawnSync } from "child_process";
import * as path from "path";


const main = function(): void {
    const args = process.argv.slice(2);
    const productPath = args[0] || "";

    if (!productPath) {
        return;
    }

    if (productPath.startsWith("-")) {
        throw new Error(
            "When passing arguments to npm run build, the first argument must be the product path."
        );
    }

    const packageProductPath = path.join(__dirname, "package-product.js");
    const result = spawnSync(
        process.execPath,
        [
            packageProductPath,
            "--product-path",
            productPath,
            ...args.slice(1)
        ],
        {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit"
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};


main();
