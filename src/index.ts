import * as fsp from 'fs/promises'
import * as fs from 'fs'

import FileSystem from '@lucas-bortoli/libdiscord-fs'

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

/**
 * Returns a Promise that resolves after a specified amount of time.
 */
const Wait = (ms: number): Promise<void> => {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

/**
 * Checks if a file exists in the filesystem.
 * @param path Path to file
 * @returns true if the file exists and is readable.
 */
const fsp_fileExists = async (path: string): Promise<boolean> => {
    try {
        await fsp.access(path, fs.constants.F_OK)
        return true
    } catch (error) {
        return false
    }
}

/**
 * Initializes a filesystem object.
 * @param driveId What drive id to use for the filesystem
 */
const openFileSystem = async (driveId: string): Promise<FileSystem> => {
    const fs = new FileSystem(`${driveId}.fsx`, process.env.DISCORD_WEBHOOK)
    
    if (await fsp_fileExists(fs.dataFile + '.working')) {
        // If there is a temporary file, we load it. 
        fs.dataFile = fs.dataFile + '.working'
        await fs.loadDataFile()
    } else {
        // Or else, we load the original file to memory and don't touch it.
        await fs.loadDataFile()
        fs.dataFile = fs.dataFile + '.working'
    }
    
    return fs
}

const saveFileSystem = async (fs: FileSystem, commit?: boolean): Promise<void> => {
    if (commit) {
        await fsp.rm(fs.dataFile)
        fs.dataFile = fs.dataFile.replace('.working', '')
    }
    
    await fs.writeDataFile()
} 

/**
 * Converts a byte count to a human-readable file size.
 */
const fileSize = (bytes: number): string => {
    if (bytes == 0) { return "0.00 B"; }
    var e = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes/Math.pow(1024, e)).toFixed(2)+' '+' KMGTP'.charAt(e)+'B';
}

/**
 * Shows the help page, optionally with an error message to be included in it.
 */
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
${errorToBeShown ? `${'-'.repeat(errorToBeShown.length + 7)}\nError: ${errorToBeShown}` : ''}`)

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

    if (!operation)
        return showHelpPageAndExit('No command given.')

    if (operation === 'download') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('download: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`download: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const { driveId, remotePath } = parseRemotePath(operand1)

        const fileSystem = await openFileSystem(driveId)
        const fileEntry = await fileSystem.getEntry(remotePath)

        // Check if file exists before downloading it
        if (!fileEntry) {
            console.error(`File doesn't exist: ${driveId}::${remotePath}`)
            return process.exit(1)
        }

        // Can't download directories at once
        if (fileEntry.type === 'directory')
            return showHelpPageAndExit(`download: Invalid remote path ${operand1} (is a directory)`)

        const remoteFileStream = await fileSystem.createReadStream(remotePath)

        // Pipe downloaded data to stdout
        remoteFileStream.pipe(process.stdout)

        // Show status information
        do {
            process.stderr.write(`Downloading: ${fileSize(remoteFileStream.readBytes)} / ${fileSize(fileEntry.size)} - ${Math.round(remoteFileStream.readBytes / fileEntry.size * 100)}%\r`)
            await Wait(500)
        } while (!remoteFileStream.readableEnded)

        process.stderr.write('\nDownload finished.\n')
    } else if (operation === 'upload') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('upload: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`upload: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const { driveId, remotePath } = parseRemotePath(operand1)

        // Can't upload a file with to a directory path
        if (remotePath.endsWith('/'))
            return showHelpPageAndExit(`upload: Invalid remote path ${operand1} (is a directory)`)

        const fileSystem = await openFileSystem(driveId)
        const remoteFileStream = await fileSystem.createWriteStream(remotePath)

        // Pipe stdin to the upload stream
        process.stdin.pipe(remoteFileStream)

        // Show status information
        do {
            process.stderr.write(`Uploading: ${fileSize(remoteFileStream.uploadedBytes)} sent\r`)
            await Wait(500)
        } while (!remoteFileStream.writableFinished)

        process.stderr.write('\nUpload finished.\n')

        await saveFileSystem(fileSystem)
    } else if (operation === 'mv') {
        // Validate remote path parameter
        if (!operand1 || !operand2)
            return showHelpPageAndExit('mv: Missing parameters')
    
        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`mv: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)
        if (!isValidRemotePath(operand2))
            return showHelpPageAndExit(`mv: Invalid remote path ${operand2} (not in format driveId::/path/to/file)`)
    
        const pathFrom = parseRemotePath(operand1)
        const pathTo = parseRemotePath(operand2)

        if (pathFrom.driveId !== pathTo.driveId) {
            console.error(`mv: Unsupported cross-drive move operation (${pathFrom.driveId} -> ${pathTo.driveId})`)
            return process.exit(1)
        }

        const fileSystem = await openFileSystem(pathFrom.driveId)

        if (!await fileSystem.exists(pathFrom.remotePath)) {
            console.error(`mv: Source path not found (${pathFrom.driveId}::${pathFrom.remotePath})`)
            return process.exit(1)
        }

        await fileSystem.mv(pathFrom.remotePath, pathTo.remotePath)
        await saveFileSystem(fileSystem)
    } else if (operation === 'rm') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('rm: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`rm: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)
        
        const target = parseRemotePath(operand1)
        const fileSystem = await openFileSystem(target.driveId)

        if (!await fileSystem.exists(target.remotePath)) {
            console.error(`rm: Path not found (${target.driveId}::${target.remotePath})`)
            return process.exit(1)
        }

        await fileSystem.rm(target.remotePath)
        await saveFileSystem(fileSystem)
    } else if (operation === 'cp') {
        // Validate remote path parameter
        if (!operand1 || !operand2)
            return showHelpPageAndExit('cp: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`cp: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)
        if (!isValidRemotePath(operand2))
            return showHelpPageAndExit(`mv: Invalid remote path ${operand2} (not in format driveId::/path/to/file)`)
    
        const pathFrom = parseRemotePath(operand1)
        const pathTo = parseRemotePath(operand2)

        if (pathFrom.driveId !== pathTo.driveId) {
            console.error(`cp: Unsupported cross-drive copy operation (${pathFrom.driveId} -> ${pathTo.driveId})`)
            return process.exit(1)
        }

        const fileSystem = await openFileSystem(pathFrom.driveId)

        if (!await fileSystem.exists(pathFrom.remotePath)) {
            console.error(`cp: Path not found (${pathFrom.driveId}::${pathFrom.remotePath})`)
            return process.exit(1)
        }

        await fileSystem.cp(pathFrom.remotePath, pathTo.remotePath)
        await saveFileSystem(fileSystem)
    } else if (operation === 'save') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('save: Missing parameters')

        const fileSystem = await openFileSystem(operand1)
        await saveFileSystem(fileSystem, true)
    } else {
        return showHelpPageAndExit(`Invalid command: ${operation}`)
    }
}

main()