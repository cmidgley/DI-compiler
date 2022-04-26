'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var tsEvaluator = require('ts-evaluator');
var TS = require('typescript');
var compatfactory = require('compatfactory');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var TS__namespace = /*#__PURE__*/_interopNamespace(TS);

const CONSTRUCTOR_ARGUMENTS_SYMBOL_IDENTIFIER = `___CTOR_ARGS___`;
const DI_CONTAINER_NAME = "DIContainer";

/**
 * A TypeNode such as IFoo<string> should still yield the service name "IFoo".
 * This helper generates a proper service name from a TypeNode
 */
function pickServiceOrImplementationName(node, context) {
    const { typescript } = context;
    if (typescript.isTypeReferenceNode(node)) {
        return pickServiceOrImplementationName(node.typeName, context);
    }
    else if (typescript.isIndexedAccessTypeNode(node)) {
        return `${pickServiceOrImplementationName(node.objectType, context)}[${pickServiceOrImplementationName(node.indexType, context)}]`;
    }
    else {
        return node.getFullText().trim();
    }
}

function visitClassLikeDeclaration(options) {
    const { node, childContinuation, continuation, context } = options;
    const { typescript, factory } = context;
    const constructorDeclaration = node.members.find(typescript.isConstructorDeclaration);
    // If there are no constructor declaration for the ClassLikeDeclaration, there's nothing to do
    if (constructorDeclaration == null) {
        return childContinuation(node);
    }
    const updatedClassMembers = [
        ...node.members.map(continuation),
        factory.createGetAccessorDeclaration(undefined, [
            factory.createModifier(typescript.SyntaxKind.PublicKeyword),
            factory.createModifier(typescript.SyntaxKind.StaticKeyword),
        ], factory.createComputedPropertyName(factory.createIdentifier(`Symbol.for("${CONSTRUCTOR_ARGUMENTS_SYMBOL_IDENTIFIER}")`)), [], undefined, factory.createBlock([
            factory.createReturnStatement(getParameterTypeNamesAsArrayLiteral(constructorDeclaration.parameters, context)),
        ])),
    ];
    if (typescript.isClassDeclaration(node)) {
        return factory.updateClassDeclaration(node, node.decorators, node.modifiers, node.name, node.typeParameters, node.heritageClauses, updatedClassMembers);
    }
    else {
        return factory.updateClassExpression(node, node.decorators, node.modifiers, node.name, node.typeParameters, node.heritageClauses, updatedClassMembers);
    }
}
/**
 * Takes ConstructorParams for the given NodeArray of ParameterDeclarations
 */
function getParameterTypeNamesAsArrayLiteral(parameters, context) {
    const { factory } = context;
    const constructorParams = [];
    for (let i = 0; i < parameters.length; i++) {
        const parameter = parameters[i];
        // If the parameter has no type, there's nothing to extract
        if (parameter.type == null) {
            constructorParams[i] = factory.createIdentifier("undefined");
        }
        else {
            constructorParams[i] = factory.createNoSubstitutionTemplateLiteral(pickServiceOrImplementationName(parameter.type, context));
        }
    }
    return factory.createArrayLiteralExpression(constructorParams);
}

// For some TypeScript versions, such as 3.1, these helpers are not exposed by TypeScript,
// so they will have to be duplicated and reused from here in these rare cases
const HELPERS = {
    importDefaultHelper: {
        name: "typescript:commonjsimportdefault",
        scoped: false,
        text: '\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { "default": mod };\n};',
    },
    importStarHelper: {
        name: "typescript:commonjsimportstar",
        scoped: false,
        text: '\nvar __importStar = (this && this.__importStar) || function (mod) {\n    if (mod && mod.__esModule) return mod;\n    var result = {};\n    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];\n    result["default"] = mod;\n    return result;\n};',
    },
};
function getImportDefaultHelper(typescript) {
    var _a;
    return (_a = typescript.importDefaultHelper) !== null && _a !== void 0 ? _a : HELPERS.importDefaultHelper;
}
function getImportStarHelper(typescript) {
    var _a;
    return (_a = typescript.importStarHelper) !== null && _a !== void 0 ? _a : HELPERS.importStarHelper;
}
function moduleKindSupportsImportHelpers(moduleKind = TS__namespace.ModuleKind.CommonJS, typescript) {
    switch (moduleKind) {
        case typescript.ModuleKind.CommonJS:
        case typescript.ModuleKind.UMD:
        case typescript.ModuleKind.AMD:
            return true;
        default:
            return false;
    }
}
function moduleKindDefinesDependencies(moduleKind = TS__namespace.ModuleKind.CommonJS, typescript) {
    switch (moduleKind) {
        case typescript.ModuleKind.UMD:
        case typescript.ModuleKind.AMD:
            return true;
        default:
            return false;
    }
}
function getUnscopedHelperName(context, helperName) {
    const typescript = context.typescript;
    if ("getUnscopedHelperName" in typescript) {
        return typescript.getUnscopedHelperName(helperName);
    }
    else if ("createEmitHelperFactory" in typescript) {
        return typescript
            .createEmitHelperFactory(context.transformationContext)
            .getUnscopedHelperName(helperName);
    }
    else {
        return typescript.getHelperName(helperName);
    }
}
function getRootBlockInsertionPosition(rootBlock, typescript) {
    let insertPosition = 0;
    for (let i = 0; i < rootBlock.statements.length; i++) {
        const statement = rootBlock.statements[i];
        const isUseStrict = typescript.isExpressionStatement(statement) &&
            typescript.isStringLiteralLike(statement.expression) &&
            statement.expression.text === "use strict";
        const isEsModuleSymbol = typescript.isExpressionStatement(statement) &&
            typescript.isCallExpression(statement.expression) &&
            typescript.isPropertyAccessExpression(statement.expression.expression) &&
            typescript.isIdentifier(statement.expression.expression.expression) &&
            typescript.isIdentifier(statement.expression.expression.name) &&
            statement.expression.expression.expression.text === "Object" &&
            statement.expression.expression.name.text === "defineProperty" &&
            statement.expression.arguments.length >= 2 &&
            typescript.isIdentifier(statement.expression.arguments[0]) &&
            statement.expression.arguments[0].text === "exports" &&
            typescript.isStringLiteralLike(statement.expression.arguments[1]) &&
            statement.expression.arguments[1].text === "__esModule";
        if (isUseStrict || isEsModuleSymbol) {
            insertPosition = Math.max(insertPosition, i + 1);
        }
    }
    return insertPosition;
}
function getDefineArrayLiteralExpression(sourceFile, context) {
    const { program, typescript } = context;
    const compilerOptions = program.getCompilerOptions();
    switch (compilerOptions.module) {
        case typescript.ModuleKind.ESNext:
        case typescript.ModuleKind.ES2015:
        case typescript.ModuleKind.ES2020:
            // There are no such thing for these module types
            return undefined;
        // If we're targeting UMD, the root block won't be the root scope, but the Function Body of an iife
        case typescript.ModuleKind.UMD: {
            for (const statement of sourceFile.statements) {
                if (typescript.isExpressionStatement(statement) &&
                    typescript.isCallExpression(statement.expression) &&
                    typescript.isParenthesizedExpression(statement.expression.expression) &&
                    typescript.isFunctionExpression(statement.expression.expression.expression) &&
                    statement.expression.expression.expression.parameters.length === 1) {
                    const [firstParameter] = statement.expression.expression.expression.parameters;
                    if (typescript.isIdentifier(firstParameter.name)) {
                        if (firstParameter.name.text === "factory") {
                            for (const subStatement of statement.expression.expression
                                .expression.body.statements) {
                                if (typescript.isIfStatement(subStatement) &&
                                    subStatement.elseStatement != null &&
                                    typescript.isIfStatement(subStatement.elseStatement) &&
                                    typescript.isBlock(subStatement.elseStatement.thenStatement)) {
                                    for (const subSubStatement of subStatement.elseStatement
                                        .thenStatement.statements) {
                                        if (typescript.isExpressionStatement(subSubStatement) &&
                                            typescript.isCallExpression(subSubStatement.expression) &&
                                            subSubStatement.expression.arguments.length === 2 &&
                                            typescript.isIdentifier(subSubStatement.expression.expression) &&
                                            subSubStatement.expression.expression.text === "define") {
                                            const [firstSubSubStatementExpressionArgument] = subSubStatement.expression.arguments;
                                            if (typescript.isArrayLiteralExpression(firstSubSubStatementExpressionArgument)) {
                                                return firstSubSubStatementExpressionArgument;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            break;
        }
        case typescript.ModuleKind.AMD: {
            for (const statement of sourceFile.statements) {
                if (typescript.isExpressionStatement(statement) &&
                    typescript.isCallExpression(statement.expression) &&
                    typescript.isIdentifier(statement.expression.expression) &&
                    statement.expression.expression.text === "define" &&
                    statement.expression.arguments.length === 2) {
                    const [firstArgument, secondArgument] = statement.expression.arguments;
                    if (typescript.isArrayLiteralExpression(firstArgument)) {
                        if (typescript.isFunctionExpression(secondArgument) &&
                            secondArgument.parameters.length >= 2) {
                            const [firstParameter, secondParameter] = secondArgument.parameters;
                            if (typescript.isIdentifier(firstParameter.name) &&
                                typescript.isIdentifier(secondParameter.name) &&
                                firstParameter.name.text === "require" &&
                                secondParameter.name.text === "exports") {
                                return firstArgument;
                            }
                        }
                    }
                }
            }
            break;
        }
    }
    return undefined;
}
function getRootBlock(sourceFile, context) {
    const { program, typescript } = context;
    const compilerOptions = program.getCompilerOptions();
    switch (compilerOptions.module) {
        // If we're targeting UMD, the root block won't be the root scope, but the Function Body of an iife
        case typescript.ModuleKind.UMD: {
            for (const statement of sourceFile.statements) {
                if (typescript.isExpressionStatement(statement) &&
                    typescript.isCallExpression(statement.expression) &&
                    statement.expression.arguments.length === 1) {
                    const [firstArgument] = statement.expression.arguments;
                    if (typescript.isFunctionExpression(firstArgument) &&
                        firstArgument.parameters.length === 2) {
                        const [firstParameter, secondParameter] = firstArgument.parameters;
                        if (typescript.isIdentifier(firstParameter.name) &&
                            typescript.isIdentifier(secondParameter.name) &&
                            firstParameter.name.text === "require" &&
                            secondParameter.name.text === "exports") {
                            return firstArgument.body;
                        }
                    }
                }
            }
            break;
        }
        // If we're targeting AMD, the root block won't be the root scope, but the Function Body of the
        // anonymous function provided as a second argument to the define() function
        case typescript.ModuleKind.AMD: {
            for (const statement of sourceFile.statements) {
                if (typescript.isExpressionStatement(statement) &&
                    typescript.isCallExpression(statement.expression) &&
                    typescript.isIdentifier(statement.expression.expression) &&
                    statement.expression.expression.text === "define" &&
                    statement.expression.arguments.length === 2) {
                    const [, secondArgument] = statement.expression.arguments;
                    if (typescript.isFunctionExpression(secondArgument) &&
                        secondArgument.parameters.length >= 2) {
                        const [firstParameter, secondParameter] = secondArgument.parameters;
                        if (typescript.isIdentifier(firstParameter.name) &&
                            typescript.isIdentifier(secondParameter.name) &&
                            firstParameter.name.text === "require" &&
                            secondParameter.name.text === "exports") {
                            return secondArgument.body;
                        }
                    }
                }
            }
            break;
        }
    }
    return sourceFile;
}
function isImportedSymbolImported(importedSymbol, rootBlock, context) {
    const compilerOptions = context.program.getCompilerOptions();
    const typescript = context.typescript;
    switch (compilerOptions.module) {
        case typescript.ModuleKind.ES2020:
        case typescript.ModuleKind.ES2015:
        case typescript.ModuleKind.ESNext: {
            for (const statement of rootBlock.statements) {
                if (!typescript.isImportDeclaration(statement))
                    continue;
                if (!typescript.isStringLiteralLike(statement.moduleSpecifier)) {
                    continue;
                }
                if (statement.moduleSpecifier.text !== importedSymbol.moduleSpecifier) {
                    continue;
                }
                if (statement.importClause == null) {
                    continue;
                }
                if ("isDefaultImport" in importedSymbol) {
                    if (importedSymbol.isDefaultImport) {
                        if (statement.importClause.name == null) {
                            continue;
                        }
                        if (statement.importClause.name.text !== importedSymbol.name) {
                            continue;
                        }
                        return true;
                    }
                    else {
                        if (statement.importClause.namedBindings == null)
                            continue;
                        if (!typescript.isNamedImports(statement.importClause.namedBindings)) {
                            continue;
                        }
                        for (const importSpecifier of statement.importClause.namedBindings
                            .elements) {
                            if (importSpecifier.name.text !== importedSymbol.name)
                                continue;
                            return true;
                        }
                    }
                }
                else if ("isNamespaceImport" in importedSymbol) {
                    if (statement.importClause.namedBindings == null)
                        continue;
                    if (!typescript.isNamespaceImport(statement.importClause.namedBindings)) {
                        continue;
                    }
                    if (statement.importClause.namedBindings.name.text !==
                        importedSymbol.name) {
                        continue;
                    }
                    return true;
                }
            }
            return false;
        }
        case typescript.ModuleKind.CommonJS:
        case typescript.ModuleKind.AMD:
        case typescript.ModuleKind.UMD: {
            for (const statement of rootBlock.statements) {
                if (!typescript.isVariableStatement(statement))
                    continue;
                for (const declaration of statement.declarationList.declarations) {
                    if (!typescript.isIdentifier(declaration.name))
                        continue;
                    if (declaration.name.text !== importedSymbol.name)
                        continue;
                    return true;
                }
            }
        }
    }
    // TODO: Add support for other module systems
    return false;
}
function generateImportStatementForImportedSymbolInContext(importedSymbol, context) {
    const compilerOptions = context.program.getCompilerOptions();
    const { factory, typescript } = context;
    switch (compilerOptions.module) {
        case typescript.ModuleKind.ES2020:
        case typescript.ModuleKind.ES2015:
        case typescript.ModuleKind.ESNext: {
            return factory.createImportDeclaration(undefined, undefined, "isDefaultImport" in importedSymbol
                ? factory.createImportClause(false, !importedSymbol.isDefaultImport
                    ? undefined
                    : factory.createIdentifier(importedSymbol.name), importedSymbol.isDefaultImport
                    ? undefined
                    : factory.createNamedImports([
                        factory.createImportSpecifier(false, importedSymbol.propertyName === importedSymbol.name
                            ? undefined
                            : factory.createIdentifier(importedSymbol.propertyName), factory.createIdentifier(importedSymbol.name)),
                    ]))
                : "isNamespaceImport" in importedSymbol
                    ? factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(importedSymbol.name)))
                    : undefined, factory.createStringLiteral(importedSymbol.moduleSpecifier));
        }
        case typescript.ModuleKind.CommonJS:
        case typescript.ModuleKind.AMD:
        case typescript.ModuleKind.UMD: {
            const requireCall = factory.createCallExpression(factory.createIdentifier("require"), undefined, [factory.createStringLiteral(importedSymbol.moduleSpecifier)]);
            let wrappedRequireCall = requireCall;
            // We'll need to use a helper, '__importDefault', and wrap the require call with it
            if (compilerOptions.esModuleInterop === true &&
                (("isDefaultImport" in importedSymbol &&
                    importedSymbol.isDefaultImport) ||
                    (!("isDefaultImport" in importedSymbol) &&
                        importedSymbol.isNamespaceImport))) {
                // If tslib is being used, we can do something like 'require("tslib").__import{Default|Star}(<requireCall>)'
                if (compilerOptions.importHelpers === true) {
                    wrappedRequireCall = factory.createCallExpression(factory.createPropertyAccessExpression(factory.createCallExpression(factory.createIdentifier("require"), undefined, [factory.createStringLiteral("tslib")]), getUnscopedHelperName(context, "isDefaultImport" in importedSymbol
                        ? "__importDefault"
                        : "__importStar")), undefined, [requireCall]);
                }
                // Otherwise, we'll have to make sure that the helper is being inlined in an transformation step later
                else {
                    // We've already requested the __importDefault helper in the before transformer under these
                    // circumstances
                    wrappedRequireCall = factory.createCallExpression(getUnscopedHelperName(context, "isDefaultImport" in importedSymbol
                        ? "__importDefault"
                        : "__importStar"), undefined, [requireCall]);
                }
            }
            return factory.createVariableStatement(undefined, factory.createVariableDeclarationList([
                factory.createVariableDeclaration(factory.createIdentifier(importedSymbol.name), undefined, undefined, wrappedRequireCall),
            ], typescript.NodeFlags.Const));
        }
    }
    // TODO: Handle other module types as well
    return undefined;
}

function visitCallExpression(options) {
    var _a, _b, _c;
    const { node, childContinuation, continuation, context, addTslibDefinition, requireImportedSymbol, } = options;
    const { typescript, factory, transformationContext } = context;
    const diMethod = getDiMethodKind(node.expression, context);
    if (diMethod != null) {
        switch (diMethod) {
            case "get" /* GET */:
            case "has" /* HAS */: {
                // If no type arguments are given, don't modify the node at all
                if (node.typeArguments == null || node.typeArguments[0] == null) {
                    return childContinuation(node);
                }
                return factory.updateCallExpression(node, node.expression, node.typeArguments, [
                    factory.createObjectLiteralExpression([
                        factory.createPropertyAssignment("identifier", factory.createStringLiteral(node.typeArguments[0].getFirstToken().getFullText().trim())),
                    ]),
                ]);
            }
            case "registerSingleton" /* REGISTER_SINGLETON */:
            case "registerTransient" /* REGISTER_TRANSIENT */: {
                let [typeArg, implementationArg] = ((_a = node.typeArguments) !== null && _a !== void 0 ? _a : []);
                // If not implementation is provided, use the type argument *as* the implementation
                if (implementationArg == null) {
                    implementationArg = typeArg;
                }
                // If another implementation is passed, used that one instead
                if (node.arguments.length > 0) {
                    implementationArg = node.arguments[0];
                }
                if (typeArg == null || implementationArg == null) {
                    return childContinuation(node);
                }
                const typeArgText = pickServiceOrImplementationName(typeArg, context);
                const implementationArgText = pickServiceOrImplementationName(implementationArg, context);
                // If the Implementation is a TypeNode, and if it originates from an ImportDeclaration, it may be stripped from the file since Typescript won't Type-check the updates from
                // a CustomTransformer and such a node would normally be removed from the imports.
                // to fix it, add an ImportDeclaration if needed
                if (typescript.isTypeNode(implementationArg)) {
                    const matchingImport = findMatchingImportDeclarationForIdentifier(implementationArgText, options);
                    if (matchingImport != null &&
                        typescript.isStringLiteralLike(matchingImport.importDeclaration.moduleSpecifier)) {
                        switch (matchingImport.kind) {
                            case "default": {
                                const compilerOptions = context.program.getCompilerOptions();
                                // Log a request for the __importDefault helper already if we will
                                // need it in a later transformation step
                                if (moduleKindSupportsImportHelpers(compilerOptions.module, typescript) &&
                                    compilerOptions.esModuleInterop === true &&
                                    compilerOptions.importHelpers !== true) {
                                    transformationContext.requestEmitHelper(getImportDefaultHelper(typescript));
                                }
                                // Log a request for adding 'tslib' to the define([...]) array for the current
                                // module system if it relies on declaring dependencies (such as UMD, AMD, and SystemJS does)
                                if (moduleKindDefinesDependencies(compilerOptions.module, typescript) &&
                                    compilerOptions.esModuleInterop === true &&
                                    compilerOptions.importHelpers === true) {
                                    addTslibDefinition();
                                }
                                requireImportedSymbol({
                                    isDefaultImport: true,
                                    moduleSpecifier: matchingImport.importDeclaration.moduleSpecifier.text,
                                    name: matchingImport.identifier.text,
                                    propertyName: matchingImport.identifier.text,
                                });
                                break;
                            }
                            case "namedImport": {
                                requireImportedSymbol({
                                    isDefaultImport: false,
                                    moduleSpecifier: matchingImport.importDeclaration.moduleSpecifier.text,
                                    name: matchingImport.importSpecifier.name.text,
                                    propertyName: (_c = (_b = matchingImport.importSpecifier.propertyName) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : matchingImport.importSpecifier.name.text,
                                });
                                break;
                            }
                            case "namespace": {
                                const compilerOptions = context.program.getCompilerOptions();
                                // Log a request for the __importStar helper already if you will
                                // need it in a later transformation step
                                if (moduleKindSupportsImportHelpers(compilerOptions.module, typescript) &&
                                    compilerOptions.esModuleInterop === true &&
                                    compilerOptions.importHelpers !== true) {
                                    transformationContext.requestEmitHelper(getImportStarHelper(typescript));
                                }
                                requireImportedSymbol({
                                    isNamespaceImport: true,
                                    moduleSpecifier: matchingImport.importDeclaration.moduleSpecifier.text,
                                    name: matchingImport.identifier.text,
                                });
                                break;
                            }
                        }
                    }
                }
                return factory.updateCallExpression(node, node.expression, node.typeArguments, [
                    typescript.isTypeNode(implementationArg)
                        ? factory.createIdentifier("undefined")
                        : continuation(implementationArg),
                    factory.createObjectLiteralExpression([
                        factory.createPropertyAssignment("identifier", factory.createNoSubstitutionTemplateLiteral(typeArgText)),
                        ...(!typescript.isTypeNode(implementationArg)
                            ? []
                            : [
                                factory.createPropertyAssignment("implementation", factory.createIdentifier(rewriteImplementationName(implementationArgText, options))),
                            ]),
                    ]),
                ]);
            }
        }
    }
    return childContinuation(node);
}
function findMatchingImportDeclarationForIdentifier(identifier, options) {
    var _a;
    const { sourceFile, context: { typescript }, } = options;
    // Find the matching import
    const importDeclarations = sourceFile.statements.filter(typescript.isImportDeclaration);
    for (const importDeclaration of importDeclarations) {
        if (importDeclaration.importClause == null)
            continue;
        // Default import
        if (((_a = importDeclaration.importClause.name) === null || _a === void 0 ? void 0 : _a.text) === identifier) {
            return {
                importDeclaration,
                kind: "default",
                identifier: importDeclaration.importClause.name,
            };
        }
        else if (importDeclaration.importClause.namedBindings != null) {
            if (typescript.isNamespaceImport(importDeclaration.importClause.namedBindings)) {
                if (importDeclaration.importClause.namedBindings.name.text === identifier) {
                    return {
                        importDeclaration,
                        kind: "namespace",
                        identifier: importDeclaration.importClause.namedBindings.name,
                    };
                }
            }
            else {
                for (const importSpecifier of importDeclaration.importClause
                    .namedBindings.elements) {
                    if (importSpecifier.name.text === identifier) {
                        return {
                            importDeclaration,
                            kind: "namedImport",
                            importSpecifier: importSpecifier,
                        };
                    }
                }
            }
        }
    }
    // No import was matched
    return undefined;
}
function rewriteImplementationName(name, options) {
    var _a;
    const { context: { typescript }, } = options;
    const compilerOptions = options.context.program.getCompilerOptions();
    switch (compilerOptions.module) {
        case typescript.ModuleKind.ES2020:
        case typescript.ModuleKind.ES2015:
        case typescript.ModuleKind.ESNext:
            return name;
        case typescript.ModuleKind.CommonJS:
        case typescript.ModuleKind.AMD:
        case typescript.ModuleKind.UMD: {
            // Find the matching import
            const match = findMatchingImportDeclarationForIdentifier(name, options);
            if (match == null) {
                return name;
            }
            switch (match.kind) {
                case "default":
                    return `${name}.default`;
                case "namespace":
                    return name;
                case "namedImport":
                    return `${name}.${((_a = match.importSpecifier.propertyName) !== null && _a !== void 0 ? _a : match.importSpecifier.name)
                        .text}`;
            }
            // Fall back to returning the original name
            return name;
        }
        default:
            // TODO: Add support for SystemJS here
            return name;
    }
}
function getDiMethodKind(node, context) {
    if (!context.typescript.isPropertyAccessExpression(node) &&
        !context.typescript.isElementAccessExpression(node)) {
        return undefined;
    }
    // Don't proceed unless the left-hand expression is the DIServiceContainer
    const type = context.typeChecker.getTypeAtLocation(node.expression);
    if (type == null ||
        type.symbol == null ||
        type.symbol.escapedName !== DI_CONTAINER_NAME) {
        return undefined;
    }
    let name;
    // If it is an element access expression, evaluate the argument expression
    if (context.typescript.isElementAccessExpression(node)) {
        const evaluationResult = context.evaluate(node.argumentExpression);
        // If no value could be computed, or if the value isn't of type string, do nothing
        if (!evaluationResult.success ||
            typeof evaluationResult.value !== "string") {
            return undefined;
        }
        else {
            name = evaluationResult.value;
        }
    }
    else {
        name = node.name.text;
    }
    switch (name) {
        case "get" /* GET */:
        case "has" /* HAS */:
        case "registerSingleton" /* REGISTER_SINGLETON */:
        case "registerTransient" /* REGISTER_TRANSIENT */:
            return name;
        default:
            return undefined;
    }
}

function visitNode$1(options) {
    if (options.context.typescript.isClassLike(options.node)) {
        return visitClassLikeDeclaration({ ...options, node: options.node });
    }
    else if (options.context.typescript.isCallExpression(options.node)) {
        return visitCallExpression({ ...options, node: options.node });
    }
    return options.childContinuation(options.node);
}

function beforeTransformer(context) {
    return (transformationContext) => {
        var _a;
        const factory = compatfactory.ensureNodeFactory((_a = transformationContext.factory) !== null && _a !== void 0 ? _a : context.typescript);
        return (sourceFile) => transformSourceFile$1(sourceFile, {
            ...context,
            transformationContext,
            factory,
        });
    };
}
function transformSourceFile$1(sourceFile, context) {
    const requiredImportedSymbolSet = new Set();
    /**
     * An optimization in which every imported symbol is converted into
     * a string that can be matched against directly to guard against
     * duplicates
     */
    const requiredImportedSymbolSetFlags = new Set();
    context.sourceFileToAddTslibDefinition.set(sourceFile.fileName, false);
    context.sourceFileToRequiredImportedSymbolSet.set(sourceFile.fileName, requiredImportedSymbolSet);
    const computeImportedSymbolFlag = (symbol) => [
        "name",
        "propertyName",
        "moduleSpecifier",
        "isNamespaceImport",
        "isDefaultImport",
    ]
        .map((property) => { var _a; return `${property}:${(_a = symbol[property]) !== null && _a !== void 0 ? _a : false}`; })
        .join("|");
    const visitorOptions = {
        context,
        addTslibDefinition: () => {
            context.sourceFileToAddTslibDefinition.set(sourceFile.fileName, true);
        },
        requireImportedSymbol: (importedSymbol) => {
            // Guard against duplicates and compute a string so we can do
            // constant time lookups to compare against existing symbols
            const flag = computeImportedSymbolFlag(importedSymbol);
            if (requiredImportedSymbolSetFlags.has(flag))
                return;
            requiredImportedSymbolSetFlags.add(flag);
            requiredImportedSymbolSet.add(importedSymbol);
        },
        continuation: (node) => visitNode$1({
            ...visitorOptions,
            sourceFile,
            node,
        }),
        childContinuation: (node) => context.typescript.visitEachChild(node, (cbNode) => visitNode$1({
            ...visitorOptions,
            sourceFile,
            node: cbNode,
        }), context.transformationContext),
    };
    return visitorOptions.continuation(sourceFile);
}

function visitRootBlock(options) {
    var _a;
    const { node, sourceFile, context } = options;
    const { typescript } = context;
    const leadingExtraStatements = [];
    for (const importedSymbol of (_a = context.sourceFileToRequiredImportedSymbolSet.get(sourceFile.fileName)) !== null && _a !== void 0 ? _a : new Set()) {
        if (isImportedSymbolImported(importedSymbol, node, context))
            continue;
        const missingImportStatement = generateImportStatementForImportedSymbolInContext(importedSymbol, context);
        if (missingImportStatement != null) {
            leadingExtraStatements.push(missingImportStatement);
        }
    }
    const insertPosition = getRootBlockInsertionPosition(node, typescript);
    return [
        ...node.statements.slice(0, insertPosition),
        ...leadingExtraStatements,
        ...node.statements.slice(insertPosition),
    ];
}

function visitRootBlockSourceFile(options) {
    const { node, context } = options;
    const { factory } = context;
    return factory.updateSourceFile(node, visitRootBlock(options), node.isDeclarationFile, node.referencedFiles, node.typeReferenceDirectives, node.hasNoDefaultLib, node.libReferenceDirectives);
}

function visitRootBlockBlock(options) {
    const { node, context } = options;
    const { factory } = context;
    return factory.updateBlock(node, visitRootBlock(options));
}

function visitDefineArrayLiteralExpression(options) {
    var _a;
    const { node, sourceFile, context } = options;
    const { typescript, factory } = context;
    const trailingExtraExpressions = [];
    for (const importedSymbol of (_a = context.sourceFileToRequiredImportedSymbolSet.get(sourceFile.fileName)) !== null && _a !== void 0 ? _a : new Set()) {
        // Skip the node if it is already declared as a dependency
        if (node.elements.some((element) => typescript.isStringLiteralLike(element) &&
            element.text === importedSymbol.moduleSpecifier)) {
            continue;
        }
        trailingExtraExpressions.push(factory.createStringLiteral(importedSymbol.moduleSpecifier));
    }
    if (context.sourceFileToAddTslibDefinition.get(sourceFile.fileName) === true) {
        trailingExtraExpressions.push(factory.createStringLiteral("tslib"));
    }
    if (trailingExtraExpressions.length < 1) {
        return node;
    }
    return factory.updateArrayLiteralExpression(node, [
        ...node.elements,
        ...trailingExtraExpressions,
    ]);
}

function visitNode(options) {
    const { node, childContinuation, defineArrayLiteralExpression, rootBlock, context: { typescript }, } = options;
    if (typescript.isSourceFile(node) && rootBlock === node) {
        return visitRootBlockSourceFile({ ...options, node });
    }
    else if (typescript.isBlock(node) && rootBlock === node) {
        return visitRootBlockBlock({ ...options, node });
    }
    else if (typescript.isArrayLiteralExpression(node) &&
        defineArrayLiteralExpression === node) {
        return visitDefineArrayLiteralExpression({
            ...options,
            node,
        });
    }
    return childContinuation(options.node);
}

function afterTransformer(context) {
    return (transformationContext) => {
        var _a;
        const factory = compatfactory.ensureNodeFactory((_a = transformationContext.factory) !== null && _a !== void 0 ? _a : context.typescript);
        return (sourceFile) => transformSourceFile(sourceFile, {
            ...context,
            transformationContext,
            factory,
        });
    };
}
function transformSourceFile(sourceFile, context) {
    // For TypeScript versions below 3.5, there may be instances
    // where EmitHelpers such as __importDefault or __importStar is duplicated.
    // For these TypeScript versions, well have to guard against this behavior
    if (sourceFile.emitNode != null && sourceFile.emitNode.helpers != null) {
        const seenNames = new Set();
        const filtered = sourceFile.emitNode.helpers.filter((helper) => {
            if (seenNames.has(helper.name))
                return false;
            seenNames.add(helper.name);
            return true;
        });
        // Reassign the emitNodes if they changed
        if (filtered.length !== sourceFile.emitNode.helpers.length) {
            sourceFile.emitNode.helpers = filtered;
        }
    }
    const visitorOptions = {
        context,
        defineArrayLiteralExpression: getDefineArrayLiteralExpression(sourceFile, context),
        rootBlock: getRootBlock(sourceFile, context),
        continuation: (node) => visitNode({
            ...visitorOptions,
            sourceFile,
            node,
        }),
        childContinuation: (node) => context.typescript.visitEachChild(node, (cbNode) => visitNode({
            ...visitorOptions,
            sourceFile,
            node: cbNode,
        }), context.transformationContext),
    };
    return visitorOptions.continuation(sourceFile);
}

/**
 * CustomTransformer that associates constructor arguments with any given class declaration
 */
function di({ typescript = TS__namespace, ...rest }) {
    const typeChecker = rest.program.getTypeChecker();
    // Prepare a VisitorContext
    const visitorContext = {
        ...rest,
        typescript,
        typeChecker,
        sourceFileToAddTslibDefinition: new Map(),
        sourceFileToRequiredImportedSymbolSet: new Map(),
        evaluate: (node) => tsEvaluator.evaluate({
            node,
            typeChecker,
            typescript,
        }),
    };
    return {
        before: [beforeTransformer(visitorContext)],
        after: [afterTransformer(visitorContext)],
    };
}

exports.di = di;
//# sourceMappingURL=index.js.map
