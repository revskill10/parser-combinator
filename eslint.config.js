import { zayne } from "@zayne-labs/eslint-config";

export default zayne({
	ignores: ["dist/**"],
	typescript: {
		tsconfigPath: "tsconfig.eslint.json",
	},
});
