/* tslint:disable */
/* eslint-disable */

/**
 * Analyse one document.
 *
 * `name` is used only to report the finding's location and to decide which
 * rules apply; nothing is read from disk.
 *
 * # Errors
 * Returns a `JsError` if the embedded rule set cannot be loaded, which would
 * mean the module was built wrong rather than that the input was bad.
 */
export function audit(name: string, content: string): any;

/**
 * Analyse a whole skill: pattern rules over each file, plus the structural
 * rules that reason about the skill rather than any one document.
 *
 * `files` is a JS object mapping a relative path to its text content.
 *
 * # Errors
 * Returns a `JsError` if `files` is not an object of strings, or if the
 * embedded rule set cannot be loaded.
 */
export function audit_skill(files: any): any;

/**
 * Collapse whitespace the way the analyzer does, for callers that want to
 * show why a split payload still matched.
 */
export function normalise(content: string): string;

/**
 * Number of rules compiled into this module.
 *
 * Exposed so a caller can assert the module is armed. Zero findings from a
 * module with zero rules is not the same answer as zero findings from a
 * module with nineteen, and only the caller can tell the difference.
 */
export function rule_count(): number;

/**
 * Identifiers of every embedded rule, sorted.
 */
export function rule_ids(): string[];

/**
 * Content address for a set of skill files, per `agtmls-spec` 3.1.
 *
 * Computed from the supplied files rather than from a directory, so a browser
 * can verify a skill it was handed without a filesystem. The result matches
 * what the CLI computes for the same file set.
 *
 * # Errors
 * Returns a `JsError` if `files` is not an object of strings.
 */
export function skill_digest(files: any): string;

/**
 * The `agtmls-spec` version this module implements.
 */
export function spec_version(): string;
