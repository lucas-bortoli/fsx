import { isAbsolute, resolve } from 'path'

const REMOTE_PATH_REGEXP = /^([A-Za-zÀ-ÖØ-öø-ÿ]+)::(\/.*)$/

interface ParsedRemotePath { driveId: string, path: string }

/**
 * Checks if a given path is remote. Remote paths start with "driveName::/"
 */
const isValidRemotePath = (p: string): boolean => {
    return !!p.match(REMOTE_PATH_REGEXP)
}

const parseRemotePath = (p: string): ParsedRemotePath => {
    const match = p.match(REMOTE_PATH_REGEXP)
    return { driveId: match[1], path: match[2] }
}

const main = async () => {
    if (!process.env.DISCORD_WEBHOOK) {
        return showHelpPageAndExit('Environment variable DISCORD_WEBHOOK not set.')
    }

    // Remove the first two elements from the argv array; we don't care about
    // Node's binary location or the current script path
    const args = process.argv.slice(2)

    // First argument will be the operation: upload/download/ls/rm/help...
    const operation = args[0]

    // The next two arguments will be the operands.
    const operand1 = args[1]
    const operand2 = args[2]


    const op1 = resolve(process.cwd(), process.argv[2])
    const op2 = process.argv[3]

    console.log(`op1: ${op1} isAbsolute: ${isAbsolute(op1)}`)
    console.log(`op2: ${op2} isAbsolute: ${isAbsolute(op2)}`)
}


const showHelpPageAndExit = (errorToBeShown?: string): never => {
    console.error(
`fsx Help Page

Usage:

    $ fsx <Command: download|upload|ls|rm|mv> [...Arguments]

Available commands:
        download driveId::/path/to/remote/file ./path/to/downloaded/file

        upload ./path/to/local/file driveId::/path/to/where/file/will/be/stored

${errorToBeShown ? `${'-'.repeat(errorToBeShown.length + 7)}\nError: ${errorToBeShown}` : ''}`
    )
    return process.exit(1)
}

main()

/**
 * fsx upload|download FROM TO
 * fsx upload ./BetterCallSaul.S06E01.mp4 DriveA::/Séries/BCS/S06/
 * fsx download DriveA::/Séries/BCS/S06E02.mp4 ./
 */