import {ICodeContainer} from "./i-code-container";
import {ICodeContainerOptions} from "./i-code-container-options";
import MagicString, {SourceMap} from "magic-string";

/**
 * A container that wraps some code that can be mutated and can generate a new SourceMap
 */
export class CodeContainer implements ICodeContainer {
	/**
	 * The raw code that was initially added to the CodeContainer
	 * @type {string}
	 */
	public readonly raw: string;

	/**
	 * The file that was initially added to the CodeContainer
	 * @type {string}
	 */
	public readonly file: string;

	/**
	 * The MagicString container which is the underlying data structure for updating the content
	 * @type {MagicString}
	 */
	private readonly magicString: MagicString;

	constructor ({code, file}: ICodeContainerOptions) {
		this.raw = code;
		this.file = file;
		this.magicString = new MagicString(this.raw);
	}

	/**
	 * Is true if mutations has been performed on the source code
	 * @type {boolean}
	 * @private
	 */
	private _hasChanged: boolean = false;

	/**
	 * Gets the current 'hasAltered' value
	 * @returns {boolean}
	 */
	public get hasChanged () {
		return this._hasChanged;
	}

	/**
	 * Gets the mutated code
	 * @returns {string}
	 */
	public get code () {
		return this.magicString.toString();
	}

	/**
	 * Gets the ICodeContainerSourceMap reflecting any updates
	 * @returns {SourceMap}
	 */
	public get map (): SourceMap {
		return this.magicString.generateMap({hires: true});
	}

	/**
	 * Appends the given content on the given position
	 * @param {string} content
	 * @param {number} [position]
	 */
	public append (content: string, position?: number): void {
		position == null ? this.magicString.append(content) : this.magicString.appendLeft(position, content);
		this._hasChanged = true;
	}

	/**
	 * Appends the given content on the given position
	 * @param {string} content
	 * @param {number} [position]
	 */
	public prepend (content: string, position?: number): void {
		position == null ? this.magicString.prepend(content) : this.magicString.prependLeft(position, content);
		this._hasChanged = true;
	}

}