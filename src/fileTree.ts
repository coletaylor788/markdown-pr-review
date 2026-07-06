export interface TreeNode {
	/** Display name (folders may be a compressed chain like "docs/specs"). */
	name: string;
	/** Full repo-relative path when this node is a file; undefined for folders. */
	path?: string;
	children: TreeNode[];
}

/** A path Obsidian won't index because a segment is a dot-folder (.claude, .github…). */
export function isHiddenPath(relPath: string): boolean {
	return relPath.split("/").some((seg) => seg.startsWith("."));
}

/**
 * Build a folder tree from repo-relative file paths, with GitHub-style
 * compression of single-child folder chains (docs → specs collapses to
 * "docs/specs"). Folders sort before files, alphabetically.
 */
export function buildFileTree(paths: string[]): TreeNode[] {
	const root: TreeNode = { name: "", children: [] };
	for (const p of paths) {
		const parts = p.split("/");
		let node = root;
		parts.forEach((part, i) => {
			const isFile = i === parts.length - 1;
			let child = node.children.find(
				(c) => c.name === part && (c.path !== undefined) === isFile
			);
			if (!child) {
				child = { name: part, children: [] };
				if (isFile) child.path = p;
				node.children.push(child);
			}
			node = child;
		});
	}
	const collapsed = root.children.map(collapseChain);
	sortNodes(collapsed);
	return collapsed;
}

function isFolder(n: TreeNode): boolean {
	return n.path === undefined;
}

function collapseChain(node: TreeNode): TreeNode {
	if (isFolder(node)) {
		while (node.children.length === 1 && isFolder(node.children[0])) {
			const only = node.children[0];
			node = { name: `${node.name}/${only.name}`, children: only.children };
		}
		node.children = node.children.map(collapseChain);
	}
	return node;
}

function sortNodes(nodes: TreeNode[]): void {
	nodes.sort((a, b) => {
		const af = isFolder(a);
		const bf = isFolder(b);
		if (af !== bf) return af ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	for (const n of nodes) if (n.children.length) sortNodes(n.children);
}
