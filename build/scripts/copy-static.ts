import * as fs from "fs";
import * as path from "path";


const rootDir = path.resolve(__dirname, "../..");
const sourceRoot = path.resolve(rootDir, "..");


const copyFile = function(sourcePath: string): void {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const targetPath = path.join(rootDir, relativePath);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
};


const copyDirectory = function(sourcePath: string, targetPath: string): void {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true
    });
};


const removeGeneratedDirectory = function(targetPath: string): void {
    fs.rmSync(targetPath, {
        recursive: true,
        force: true
    });
};


const removeGeneratedFile = function(targetPath: string): void {
    fs.rmSync(targetPath, {
        force: true
    });
};


const cleanGeneratedAssetDirectories = function(): void {
    removeGeneratedDirectory(path.join(rootDir, "shared/assets"));
    removeGeneratedDirectory(path.join(rootDir, "shared/base-app/assets"));
    removeGeneratedDirectory(path.join(rootDir, "build/output"));
    removeGeneratedDirectory(path.join(rootDir, "tests"));
    removeGeneratedDirectory(path.join(rootDir, "artifacts"));
    removeGeneratedDirectory(path.join(rootDir, "products"));
};


const copyPackageJson = function(): void {
    const sourcePackagePath = path.join(sourceRoot, "package.json");
    const targetPackagePath = path.join(rootDir, "package.json");
    const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
    const targetPackage = {
        ...sourcePackage,
        main: "build/scripts/electron-main.js",
        build: {
            ...sourcePackage.build,
            files: [
                "build/scripts/**/*",
                "shared/**/*",
                "products/**/*",
                "node_modules/monaco-editor/**/*",
                "node_modules/sortablejs/**/*",
                "package.json"
            ],
            asarUnpack: [
                "shared/runtime/providers/r/r-sources/**/*"
            ]
        }
    };

    fs.mkdirSync(path.dirname(targetPackagePath), { recursive: true });
    fs.writeFileSync(targetPackagePath, `${JSON.stringify(targetPackage, null, 4)}\n`);
};


const walk = function(dirPath: string): void {
    fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            if (entry.name !== "dist" && entry.name !== "node_modules" && entry.name !== ".git") {
                walk(entryPath);
            }
            return;
        }

        const staticJavaScript = entry.name.endsWith(".js")
            && entryPath.includes(path.join("shared", "base-app", "pages", "shared"));

        if (staticJavaScript || /\.(html|css|json|R|svg|png|ico|icns|ttf|txt)$/.test(entry.name)) {
            copyFile(entryPath);
        }
    });
};


cleanGeneratedAssetDirectories();

["shared"].forEach((dirName) => {
    walk(path.join(sourceRoot, dirName));
});

copyPackageJson();

copyDirectory(
    path.join(sourceRoot, "node_modules/monaco-editor/min/vs"),
    path.join(rootDir, "node_modules/monaco-editor/min/vs")
);

copyDirectory(
    path.join(sourceRoot, "node_modules/monaco-editor"),
    path.join(rootDir, "node_modules/monaco-editor")
);

copyDirectory(
    path.join(sourceRoot, "node_modules/sortablejs"),
    path.join(rootDir, "node_modules/sortablejs")
);
