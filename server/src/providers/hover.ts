import {
    TextDocuments,
    TextDocumentPositionParams,
    Hover
} from 'vscode-languageserver/node'
import { Range, TextDocument } from 'vscode-languageserver-textdocument'
import MasterCSS, { render } from '@master/css'
import { css_beautify } from 'js-beautify'
import { getDefaultCSSDataProvider } from 'vscode-css-languageservice'
import { getCssEntryMarkdownDescription } from '../utils/get-css-entry-markdown-description'
import { masterCssKeyValues } from '../constant'



export function GetHoverInstance(textDocumentPosition: TextDocumentPositionParams, documents: TextDocuments<TextDocument>) {
    const documentUri = textDocumentPosition.textDocument.uri
    const language = documentUri.substring(documentUri.lastIndexOf('.') + 1)
    const position = textDocumentPosition.position

    const document = documents.get(documentUri)

    let instanceRange =
    {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
    }

    const line = document?.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 },
    })

    let lineText: string = line == null ? '' : line

    const text = document?.getText({
        start: { line: 0, character: 0 },
        end: { line: position.line, character: position.character },
    })

    //#region is in class
    const lastClass = text?.lastIndexOf('class') ?? -1
    const lastclassName = text?.lastIndexOf('className') ?? -1
    const tsxclassName = text?.lastIndexOf('className={') ?? -1

    if (lastClass + lastclassName + tsxclassName == -1) {
        return { isInstance: false, instance: '', range: instanceRange, language: language }
    }

    const tsxclassNameMode = tsxclassName >= (lastClass > lastclassName ? lastClass : lastclassName)
    let textSub = text?.substring(lastClass > lastclassName ? lastClass : lastclassName)
    textSub = textSub == null ? '' : textSub


    let classQuoted = '', classIndexAddOne = '', classIndexAddTwo = ''


    if (tsxclassNameMode) {
        textSub = text?.substring(tsxclassName) == null ? '' : textSub
        if (InCurlyBrackets(textSub) == false) {
            return { isInstance: false, instance: '', range: instanceRange, language: language }
        }
    }
    else {
        if (lastClass > lastclassName) {
            classIndexAddOne = textSub.substring(5).trimStart().charAt(0)
            classIndexAddTwo = textSub.substring(5).trimStart().substring(1).trimStart().charAt(0)
        }
        else if (lastClass <= lastclassName) {
            classIndexAddOne = textSub.substring(9).trimStart().charAt(0)
            classIndexAddTwo = textSub.substring(9).trimStart().substring(1).trimStart().charAt(0)
        }
        classQuoted = classIndexAddOne + classIndexAddTwo
        if (classQuoted != '=\'' && classQuoted != '=`' && classQuoted != '="') {
            return { isInstance: false, instance: '', range: instanceRange, language: language }
        }
    }

    const quotedSingle = textSub.split('\'').length - 1
    const quotedDouble = textSub.split('"').length - 1
    const quotedTemplate = textSub.split('`').length - 1
    if (!tsxclassNameMode) {
        if (classQuoted == '=\'' && quotedSingle >= 2) {
            return { isInstance: false, instance: '', range: instanceRange, language: language }
        }
        else if (classQuoted == '="' && quotedDouble >= 2) {
            return { isInstance: false, instance: '', range: instanceRange, language: language }
        }
        else if (classQuoted == '=`' && quotedTemplate >= 2) {
            return { isInstance: false, instance: '', range: instanceRange, language: language }
        }
    }

    if (!((quotedSingle > 0 || quotedDouble > 0 || quotedTemplate > 0) && (quotedSingle % 2 != 0 || quotedDouble % 2 != 0 || quotedTemplate % 2 != 0))) {
        return { isInstance: false, instance: '', range: instanceRange, language: language }
    }
    //#endregion is in class
    lineText = lineText.replace('[^\\S\\r\\n]+', ' ')

    let instanceStart = lineText.substring(0, position.character).lastIndexOf(' ')
    let instanceEnd = lineText.indexOf(' ', position.character)
    instanceEnd = instanceEnd == -1 ? lineText.length - 1 : instanceEnd

    if (tsxclassNameMode) {
        instanceStart = instanceStart > lineText.substring(0, position.character).lastIndexOf('{') ? instanceStart : lineText.substring(0, position.character).lastIndexOf('{')
        instanceEnd = instanceEnd < lineText.indexOf('}', position.character) ? instanceEnd : (lineText.indexOf('}', position.character) == -1 ? instanceEnd : lineText.indexOf('}', position.character))
    }
    else {
        instanceStart = instanceStart > lineText.substring(0, position.character).lastIndexOf(classIndexAddTwo) ? instanceStart : lineText.substring(0, position.character).lastIndexOf(classIndexAddTwo)
        instanceEnd = instanceEnd > lineText.indexOf(classIndexAddTwo, position.character)
            && lineText.indexOf(classIndexAddTwo, position.character) != -1
            ? lineText.indexOf(classIndexAddTwo, position.character)
            : instanceEnd
    }


    instanceRange = {
        start: { line: position.line, character: instanceStart + 1 },
        end: { line: position.line, character: instanceEnd },
    }
    const instance = document?.getText(instanceRange) ?? ''

    return { isInstance: true, instance: instance, range: instanceRange, language: language }
}
function InCurlyBrackets(text: string): boolean {
    let curlybrackets = 0
    for (let i = 0; i < text.length; i++) {
        if (text.charAt(i) == '{') {
            curlybrackets += 1
        }
        else if (text.charAt(i) == '}') {
            curlybrackets -= 1
            if (curlybrackets <= 0) {
                return false
            }
        }
    }
    if (curlybrackets <= 0) {
        return false
    }
    return true
}

export function doHover(instance: string, range: Range, masterCss: MasterCSS = new MasterCSS()): Hover | null {
    
    const contents = []

    const cssPreview = getCssPreview(instance, masterCss)
    if (cssPreview) {
        contents.push(cssPreview)
    }

    const cssHoverInfo = getCssHoverInfo(instance)
    if (cssHoverInfo) {
        contents.push(cssHoverInfo)
    }

    return {
        contents,
        range: range
    }
}

function getCssPreview(instance: string, masterCss: MasterCSS = new MasterCSS()) {
    const renderText = render(instance.split(' '), masterCss.config)
    if (!renderText || renderText == ' ') {
        return null
    }

    return {
        language: 'css',
        value: css_beautify(renderText, {
            newline_between_rules: true,
            end_with_newline: true
        })
    }
}

function getCssHoverInfo(instance: string) {
    const masterKey = instance.split(':')[0]
    const cssDataProvider = getDefaultCSSDataProvider()
    const cssProperties = cssDataProvider.provideProperties()

    let cssHoverInfo: any = null
    for (const masterCssKeyValue of masterCssKeyValues) {
        const fullKey = masterCssKeyValue.key[0]
        const originalCssProperty = cssProperties.find(x => x.name == fullKey)
        if (masterCssKeyValue.key.includes(masterKey) && originalCssProperty) {
            if (!originalCssProperty.references?.find(x => x.name === 'Master Reference')) {
                originalCssProperty.references = [
                    ...(originalCssProperty?.references ?? []),
                    {
                        name: 'Master Reference',
                        url: `https://beta.css.master.co/docs/${fullKey}`
                    }
                ]
            }
            cssHoverInfo = getCssEntryMarkdownDescription(originalCssProperty)
            break
        }
    }
    return cssHoverInfo
}