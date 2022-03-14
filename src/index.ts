import { isAbsolute, resolve } from 'path'
import FileSystem from '@lucas-bortoli/libdiscord-fs'
import { FileHandle } from 'fs/promises'
import { EventEmitter } from 'stream'

const REMOTE_PATH_REGEXP = /^([A-Za-zÀ-ÖØ-öø-ÿ]+)::(\/.*)$/

interface ParsedRemotePath { driveId: string, remotePath: string }

// All log messages should be written to stderr, because stdout is used for file
// data
console.log = console.error

/**
 * Checks if a given path is remote. Remote paths start with "driveName::/"
 */
const isValidRemotePath = (p: string): boolean => {
    return !!p.match(REMOTE_PATH_REGEXP)
}

const parseRemotePath = (p: string): ParsedRemotePath => {
    const match = p.match(REMOTE_PATH_REGEXP)
    return { driveId: match[1], remotePath: match[2] }
}

const waitForEvent = (emitter: EventEmitter, event: string): Promise<void> => {
    return new Promise(resolve => {
        emitter.once(event, () => resolve())
    })
}

/**
 * Initializes a filesystem object.
 * @param driveId What drive id to use for the filesystem
 */
const openFileSystem = async (driveId: string): Promise<FileSystem> => {
    const fs = new FileSystem(`${driveId}.fsx`, process.env.DISCORD_WEBHOOK)
    await fs.loadDataFile()
    return fs
}

const showHelpPageAndExit = (errorToBeShown?: string): never => {
    console.error(
`fsx Help Page

Usage:

    $ fsx {download|upload|ls|rm|mv} [...Arguments]

Available commands:
        download driveId::/path/to/remote/file
        The downloaded data is piped to STDOUT. Use shell redirection to write it to disk.
        EXAMPLE:
            $ fsx download drive::/documents/file.txt > file.txt

        upload driveId::/path/to/where/file/will/be/stored
        The file stream is read from STDIN. Pipe a file using your shell to upload it.
        EXAMPLE:
            $ cat file.txt | fsx upload drive::/documents/file.txt
${errorToBeShown ? `${'-'.repeat(errorToBeShown.length + 7)}\nError: ${errorToBeShown}` : ''}`
    )
    return process.exit(1)
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

    if (operation === 'download') {
        if (!operand1)
            return showHelpPageAndExit('download: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`download: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const { driveId, remotePath } = parseRemotePath(operand1)
        const fileSystem = await openFileSystem(driveId)

        if (!await fileSystem.getFileEntry(remotePath)) {
            console.error(`File doesn't exist: ${driveId}::${remotePath}`)
            return process.exit(1)
        }

        const remoteFileStream = await fileSystem.createReadStream(remotePath)

        remoteFileStream.pipe(process.stdout)

        await waitForEvent(remoteFileStream, 'finish')
    } else if (operation === 'upload') {
        if (!operand1)
            return showHelpPageAndExit('upload: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`upload: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const { driveId, remotePath } = parseRemotePath(operand1)
        const fileSystem = await openFileSystem(driveId)
        const remoteFileStream = await fileSystem.createWriteStream(remotePath)

        process.stdin.pipe(remoteFileStream)

        await waitForEvent(remoteFileStream, 'finish')
        await fileSystem.writeDataFile()
        console.log('File uploaded')
    } else {
        return showHelpPageAndExit(`Invalid command: ${operation}`)
    }
}

main()

/**
 * fsx upload|download FROM TO
 * fsx upload ./BetterCallSaul.S06E01.mp4 DriveA::/Séries/BCS/S06/
 * fsx download DriveA::/Séries/BCS/S06E02.mp4 ./
 */