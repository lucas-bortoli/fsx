import * as fsp from 'fs/promises'
import * as fs from 'fs'
import * as path from 'path'

import FileSystem from '@lucas-bortoli/libdiscord-fs'

import Utils from './utils.js'

const REMOTE_PATH_WITH_DRIVE_REGEXP = /^(.*[^\/])::(\/.*)$/m
const REMOTE_PATH_WITHOUT_DRIVE_REGEXP = /^(\/.*)$/

interface ParsedRemotePath { driveId: string, remotePath: string }

// All log messages should be written to stderr, because stdout is used for file
// data
const Mode = { SILENT: false }
const _conserror = console.error
console.error = (...args) => {
    if (Mode.SILENT) return
    
    _conserror(...args)
}
console.log = console.error

/**
 * Checks if a given path is remote. Remote paths start with "driveName::/"
 */
const isValidRemotePath = (p: string): boolean => {
    if (process.env.FSX_DRIVE)
        return !!p.match(REMOTE_PATH_WITHOUT_DRIVE_REGEXP)

    return !!p.match(REMOTE_PATH_WITH_DRIVE_REGEXP)
}

const parseRemotePath = (p: string): ParsedRemotePath => {
    if (process.env.FSX_DRIVE) {
        const match = p.match(REMOTE_PATH_WITHOUT_DRIVE_REGEXP)
        return { driveId: process.env.FSX_DRIVE, remotePath: match[1].replaceAll('+', ' ') }
    }

    const match = p.match(REMOTE_PATH_WITH_DRIVE_REGEXP)
    return { driveId: match[1], remotePath: match[2].replaceAll('+', ' ') }
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
 * @param drivePath What drive id to use for the filesystem
 */
const openFileSystem = async (drivePath: string): Promise<FileSystem> => {
    const libfs = new FileSystem(process.env.DISCORD_WEBHOOK)
    let dataFile = path.resolve(drivePath)
    
    if (await fsp_fileExists(dataFile + '.working')) {
        // If there is a temporary file, we load it. 
        dataFile = dataFile + '.working'
    } else {
        // Or else, we load the original file to memory and don't touch it.
    }

    // If file doesn't exist, proceed with an empty filesystem
    if (!await fsp_fileExists(dataFile)) {
        console.error(`Tried to open data file ${dataFile}, but it doesn't exist. Proceeding with an empty filesystem.`)
        return libfs
    }

    // console.error(`Opening data file ${dataFile}`)

    const fileStream = fs.createReadStream(dataFile)

    await libfs.loadDataFromStream(fileStream)

    return libfs
}

const saveFileSystem = async (drivePath: string, fsx: FileSystem, commit?: boolean): Promise<void> => {
    drivePath = path.resolve(drivePath)

    if (commit) {
        if (fsp_fileExists(drivePath + '.working'))
            await fsp.rm(drivePath + '.working')
    } else {
        drivePath = drivePath + '.working'
    }
    
    const fileStream = fs.createWriteStream(drivePath)
    await fsx.writeDataToStream(fileStream)
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

    $ fsx {download|upload|ls|rm|mv|cp} [...Arguments]

Available commands:
        download: The downloaded data is piped to STDOUT. Use shell redirection
        to write it to disk.
            EXAMPLE:    $ fsx download drive::/documents/file.txt > file.txt
        
        upload: The file stream is read from STDIN. Pipe a file using your shell
        to upload it.
            EXAMPLE:    $ cat file.txt | fsx upload drive::/documents/file.txt

        ls: Lists the given directory.
            EXAMPLE:    $ fsx ls drive::/Documents/Spreadsheets/

        rm: Removes the given file/directory from the index. It does not,
        however, delete the file from the server.
            EXAMPLE:    $ fsx ls drive::/Documents/Spreadsheets/

        cp: Copies a file or directory to a new location.
            EXAMPLE:    $ fsx cp drive::/Pics/220315150302.jpg drive::/OldPics/
${errorToBeShown ? `${'-'.repeat(errorToBeShown.length + 7)}\nError: ${errorToBeShown}` : ''}`)

    return process.exit(1)
}

const main = async () => {
    if (!process.env.DISCORD_WEBHOOK) {
        return showHelpPageAndExit('Environment variable DISCORD_WEBHOOK not set.')
    }

    // Remove the first two elements from the argv array; we don't care about
    // Node's binary location or the current script path
    const args: string[] = [].concat(process.argv.slice(2))
    const argsWithoutFlags: string[] = args.filter(arg => !arg.startsWith('-'))

    // First argument will be the operation: upload/download/ls/rm/help...
    const operation = argsWithoutFlags[0]

    // The next two arguments will be the operands.
    const operand1 = argsWithoutFlags[1]
    const operand2 = argsWithoutFlags[2]

    if (!operation)
        return showHelpPageAndExit('No command given.')

    if (args.includes('--silent'))
        Mode.SILENT = true

    if (operation === 'help' || args.includes('--help') || args.includes('-h'))
        return showHelpPageAndExit()
    
    if (operation === 'download') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('download: Missing parameters')

        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`download: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const { driveId, remotePath } = parseRemotePath(operand1)

        const fileSystem = await openFileSystem(driveId)
        const fileEntry = fileSystem.getEntry(remotePath)

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

        if (!Mode.SILENT) {
            let previousTotalByteCount = 0
            let dt = 0
            let totalTime = 0
            let transferRate = 0
            
            do {
                if (previousTotalByteCount !== remoteFileStream.readBytes) {
                    transferRate = Math.floor((remoteFileStream.readBytes - previousTotalByteCount) / dt)
                    previousTotalByteCount = remoteFileStream.readBytes
                    dt = -0.5
                }
                process.stderr.clearLine(0)
                process.stderr.cursorTo(0)
                process.stderr.write(`Downloading: ${(fileSize(remoteFileStream.readBytes) + '/' + fileSize(fileEntry.size)).padEnd(20)} ${(Math.round(remoteFileStream.readBytes / fileEntry.size * 100) + '%').padEnd(6)} ${(fileSize(transferRate) + '/s').padEnd(12)} elapsed ${Utils.secondsToHuman(totalTime)}`)
                await Utils.Wait(900)
                dt += 0.5
                totalTime += 0.5
            } while (!remoteFileStream.readableEnded)
    
            process.stderr.write('\nDownload finished.\n')
        }
        
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

        if (!Mode.SILENT) {
            // Show status information
            let previousTotalUploadedBytes = 0
            let dt = 0
            let totalTime = 0
            let uploadRate = 0

            do {
                if (previousTotalUploadedBytes !== remoteFileStream.uploadedBytes) {
                    uploadRate = Math.floor((remoteFileStream.uploadedBytes - previousTotalUploadedBytes) / dt)
                    previousTotalUploadedBytes = remoteFileStream.uploadedBytes
                    dt = -0.5
                }

                process.stderr.clearLine(0)
                process.stderr.cursorTo(0)
                process.stderr.write(`Uploading: ${fileSize(remoteFileStream.uploadedBytes)} sent - ${fileSize(uploadRate)}/s - elapsed ${Utils.secondsToHuman(totalTime)}`)
                await Utils.Wait(500)
                dt += 0.5
                totalTime += 0.5
            } while (!remoteFileStream.writableFinished)

            process.stderr.write(`\nUpload finished.\n`)
        }

        await saveFileSystem(driveId, fileSystem)
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

        if (!fileSystem.exists(pathFrom.remotePath)) {
            console.error(`mv: Source path not found (${pathFrom.driveId}::${pathFrom.remotePath})`)
            return process.exit(1)
        }

        fileSystem.mv(pathFrom.remotePath, pathTo.remotePath)
        await saveFileSystem(pathFrom.driveId, fileSystem)
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

        fileSystem.rm(target.remotePath)
        await saveFileSystem(target.driveId, fileSystem)
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

        if (!fileSystem.exists(pathFrom.remotePath)) {
            console.error(`cp: Path not found (${pathFrom.driveId}::${pathFrom.remotePath})`)
            return process.exit(1)
        }

        fileSystem.cp(pathFrom.remotePath, pathTo.remotePath)
        await saveFileSystem(pathFrom.driveId, fileSystem)

    } else if (operation === 'ls') {
        // Validate remote path parameter
        if (!operand1)
            return showHelpPageAndExit('ls')
        
        if (!isValidRemotePath(operand1))
            return showHelpPageAndExit(`ls: Invalid remote path ${operand1} (not in format driveId::/path/to/file)`)

        const path = parseRemotePath(operand1)
        const fileSystem = await openFileSystem(path.driveId)

        const target = fileSystem.getEntry(path.remotePath)

        if (!target) {
            console.error(`ls: Path not found (${path.driveId}::${path.remotePath})`)
            return process.exit(1)
        }

        if (target.type !== 'directory') {
            console.error(`ls: Not a directory (${path.driveId}::${path.remotePath})`)
            return process.exit(1)
        }

        const biggestNameLength = Math.max(Math.max(...Object.keys(target.items).map(name => name.length)), 0)

        for (const [ name, child ] of Utils.naturalSort(Object.entries(target.items))) {
            if (child.type === 'directory') {
                process.stdout.write(`${(name + '/').padEnd(biggestNameLength)} DIRECTORY ${Utils.unit(Object.values(child.items).length, 'item').padStart(12)}\n`)
            } else {
                process.stdout.write(`${name.padEnd(biggestNameLength)} FILE      ${fileSize(child.size).padStart(12)}  ${Utils.bestDateFormat(child.ctime)} \n`)
            }
        }
    } else if (operation === 'save') {
        // Validate remote path parameter
        if (!operand1 && !process.env.FSX_DRIVE)
            return showHelpPageAndExit('save: Missing parameters')

        const drive = operand1 || process.env.FSX_DRIVE
        const fileSystem = await openFileSystem(drive)
        await saveFileSystem(drive, fileSystem, true)
    } else if (operation === 'shell-completion') {
        // Validate remote path parameter
        if (!operand1 || !isValidRemotePath(operand1)) {
            process.stdout.write('/~~~')
            return process.exit(1)
        }

        const targetDir = parseRemotePath(operand1)
        const fileSystem = await openFileSystem(targetDir.driveId)

        if (!targetDir.remotePath.endsWith('/')) {
            targetDir.remotePath = path.dirname(targetDir.remotePath)
        }

        let target = fileSystem.getEntry(targetDir.remotePath)

        if (!target || target.type !== 'directory') {
            targetDir.remotePath = path.dirname(targetDir.remotePath)
            target = fileSystem.getEntry(targetDir.remotePath)

            if (!target) return process.exit(1)
            if (target.type === 'file') {
                process.stdout.write(targetDir.remotePath)
                return process.exit(1)
            }
        }

        for (const [ name, child ] of Object.entries(target.items)) {
            if (child.type === 'directory') {
                process.stdout.write(`${path.join(targetDir.remotePath, name).replaceAll(' ', '+')}/~~~`)
            } else {
                process.stdout.write(`${path.join(targetDir.remotePath, name).replaceAll(' ', '+')}~~~`)
            }
        }  
    } else {
        return showHelpPageAndExit(`Invalid command: ${operation}`)
    }
}

main()