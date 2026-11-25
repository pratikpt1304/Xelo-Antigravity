export type CodeLang = 'c' | 'cpp' | 'java' | 'python' | 'rust' | 'go';

export const LANG_FILES: Record<CodeLang, string> = {
  c: 'main.c',
  cpp: 'main.cpp',
  java: 'Main.java',
  python: 'main.py',
  rust: 'main.rs',
  go: 'main.go',
};

export const LANG_LABELS: Record<CodeLang, string> = {
  c: 'C (GCC 13)',
  cpp: 'C++ (G++ 13)',
  java: 'Java 21',
  python: 'Python 3.12',
  rust: 'Rust',
  go: 'Go 1.22',
};

export const STARTER_CODE: Record<CodeLang, string> = {
  c: '#include <stdio.h>\n\nint main(void) {\n    // Write your solution here\n    return 0;\n}\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  python: 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
  rust: 'use std::io::{self, Read};\n\nfn main() {\n    // Write your solution here\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t_ = fmt.Sprint()\n}\n',
};
