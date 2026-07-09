import type * as Monaco from 'monaco-editor';

export const R_TAG_PATTERN = /@[a-zA-Z]\w*/;
export const R_ARGUMENT_NAME_PATTERN = /\.?[a-zA-Z][\w.]*(?=\s*=(?!=))/;
export const R_FUNCTION_CALL_PATTERN = /\.?[a-zA-Z][\w.]*(?=\s*\()/;
export const R_IDENTIFIER_PATTERN = /\.?[a-zA-Z][\w.]*/;

const R_LANGUAGE_CONSTANTS = [
  'NULL', 'FALSE', 'TRUE', 'NA', 'Inf', 'NaN', 'NA_integer_', 'NA_real_', 'NA_complex_',
  'NA_character_'
];
const R_RESERVED_WORDS = [
  'break', 'else', 'for', 'function', 'if', 'in', 'next', 'repeat', 'while'
];

const R_LANGUAGE_CONFIG: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '#'
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' }
  ]
};
const R_LANGUAGE: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.r',
  roxygen: [
    '@alias', '@aliases', '@assignee', '@author', '@backref', '@callGraph', '@callGraphDepth',
    '@callGraphPrimitives', '@concept', '@describeIn', '@description', '@details', '@docType',
    '@encoding', '@evalNamespace', '@evalRd', '@example', '@examples', '@export', '@exportClass',
    '@exportMethod', '@exportPattern', '@family', '@field', '@formals', '@format', '@import',
    '@importClassesFrom', '@importFrom', '@importMethodsFrom', '@include', '@inherit',
    '@inheritDotParams', '@inheritParams', '@inheritSection', '@keywords', '@md', '@method',
    '@name', '@noMd', '@noRd', '@note', '@param', '@rawNamespace', '@rawRd', '@rdname',
    '@references', '@return', '@S3method', '@section', '@seealso', '@setClass', '@slot',
    '@source', '@template', '@templateVar', '@title', '@TODO', '@usage', '@useDynLib'
  ],
  constants: R_LANGUAGE_CONSTANTS,
  keywords: R_RESERVED_WORDS,
  special: ['\\n', '\\r', '\\t', '\\b', '\\a', '\\f', '\\v', "\\'", '\\"', '\\\\'],
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.bracket' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' }
  ],
  tokenizer: {
    root: [
      { include: '@numbers' },
      { include: '@strings' },
      [/[{}\[\]()]/, '@brackets'],
      { include: '@operators' },
      [/#'$/, 'comment.doc'],
      [/#'/, 'comment.doc', '@roxygen'],
      [/(^#.*$)/, 'comment'],
      [/\s+/, 'white'],
      [/[,:;]/, 'delimiter'],
      [R_TAG_PATTERN, 'tag'],
      [R_ARGUMENT_NAME_PATTERN, 'argument.name'],
      [
        R_FUNCTION_CALL_PATTERN,
        {
          cases: {
            '@keywords': 'keyword',
            '@constants': 'constant',
            '@default': 'function.call'
          }
        }
      ],
      [
        R_IDENTIFIER_PATTERN,
        {
          cases: {
            '@keywords': 'keyword',
            '@constants': 'constant',
            '@default': 'identifier'
          }
        }
      ]
    ],
    roxygen: [
      [
        /@\w+/,
        {
          cases: {
            '@roxygen': 'tag',
            '@eos': { token: 'comment.doc', next: '@pop' },
            '@default': 'comment.doc'
          }
        }
      ],
      [
        /\s+/,
        {
          cases: {
            '@eos': { token: 'comment.doc', next: '@pop' },
            '@default': 'comment.doc'
          }
        }
      ],
      [/.*/, { token: 'comment.doc', next: '@pop' }]
    ],
    numbers: [
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/-?(\d*\.)?\d+([eE][+\-]?\d+)?/, 'number']
    ],
    operators: [
      [/<{1,2}-/, 'operator'],
      [/->{1,2}/, 'operator'],
      [/%[^%\s]+%/, 'operator'],
      [/\*\*/, 'operator'],
      [/%%/, 'operator'],
      [/&&/, 'operator'],
      [/\|\|/, 'operator'],
      [/<</, 'operator'],
      [/>>/, 'operator'],
      [/[-+=&|!<>^~*/:$]/, 'operator']
    ],
    strings: [
      [/'/, 'string.escape', '@stringBody'],
      [/"/, 'string.escape', '@dblStringBody']
    ],
    stringBody: [
      [
        /\\./,
        {
          cases: {
            '@special': 'string',
            '@default': 'error-token'
          }
        }
      ],
      [/'/, 'string.escape', '@popall'],
      [/./, 'string']
    ],
    dblStringBody: [
      [
        /\\./,
        {
          cases: {
            '@special': 'string',
            '@default': 'error-token'
          }
        }
      ],
      [/"/, 'string.escape', '@popall'],
      [/./, 'string']
    ]
  }
};

export const registerConsoleRLanguage = (monaco: typeof Monaco) => {
  if (!monaco?.languages) return;
  try {
    monaco.languages.register({ id: 'r' });
  } catch {}
  try {
    monaco.languages.setLanguageConfiguration('r', R_LANGUAGE_CONFIG);
  } catch {}
  try {
    monaco.languages.setMonarchTokensProvider('r', R_LANGUAGE);
  } catch {}
};
