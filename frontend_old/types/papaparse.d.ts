declare module 'papaparse' {
  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }

  export interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface ParseConfig<T> {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    dynamicTyping?: boolean | Record<string, boolean>;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: string | boolean;
    download?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    delimitersToGuess?: string[];
    transform?: (value: string, field?: string | number) => string;
    fastMode?: boolean;
  }

  export function parse<T = any>(input: string, config?: ParseConfig<T>): ParseResult<T>;

  const Papa: {
    parse: typeof parse;
  };

  export default Papa;
}
