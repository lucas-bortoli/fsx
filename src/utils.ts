import { Entry } from '@lucas-bortoli/libdiscord-fs'
import * as fsp from 'fs/promises'
import * as fs from 'fs'

const REMOTE_PATH_WITH_DRIVE_REGEXP = /^(.*[^\/])::(\/.*)$/m
const REMOTE_PATH_WITHOUT_DRIVE_REGEXP = /^(\/.*)$/
interface ParsedRemotePath { driveId: string, remotePath: string }

export default abstract class Utils {
    public static naturalSort(entries: [string, Entry][]): [string, Entry][] {
        return entries.sort((a, b) => {
            return (a[1].type + a[0]).localeCompare((b[1].type + b[0]), undefined, {numeric: true, sensitivity: 'base'})
        })
    }

    /**
     * Converts a value to its unit representation, handling plurals.
     * @example unit(3, 'item') => '3 items'
     */
    public static unit(value: number, unit: string): string {
        return `${value} ${unit + ((value !== 1) ? 's' : '')}`
    }

    /**
     * Returns a Promise that resolves after a specified amount of time.
     */
    public static Wait = (ms: number): Promise<void> => {
        return new Promise(resolve => {
            setTimeout(resolve, ms)
        })
    }

    public static secondsToHuman(s: number): string {
        const milliseconds = s * 1000;
        let temp = milliseconds / 1000;
        const years = Math.floor( temp / 31536000 ),
              days = Math.floor( ( temp %= 31536000 ) / 86400 ),
              hours = Math.floor( ( temp %= 86400 ) / 3600 ),
              minutes = Math.floor( ( temp %= 3600 ) / 60 ),
              seconds = temp % 60;
    
        if ( days || hours || seconds || minutes ) {
          return ( years ? years + "y " : "" ) +
          ( days ? days + "d " : "" ) +
          ( hours ? hours + "h " : ""  ) +
          ( minutes ? minutes + "m " : "" ) +
          seconds.toFixed(0) + "s";
        }
    
        return "< 1s";
    }

    /**
     * Best date string format: "YYYY-MM-DD hh:mm:ss"
     * I was going to add moment.js just for this but that's too heavy
     */
    public static bestDateFormat(date: Date|number): string {
        if (!(date instanceof Date))
            date = new Date(date)

        const pad = s => s.toString().padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    /**
     * Checks if a file exists in the filesystem.
     * @param path Path to file
     * @returns true if the file exists and is readable.
     */
    public static async fsp_fileExists(path: string): Promise<boolean> {
        try {
            await fsp.access(path, fs.constants.F_OK)
            return true
        } catch (error) {
            return false
        }
    }

    /**
     * Checks if a given path is remote. Remote paths start with "driveName::/"
     */
    public static isValidRemotePath(p: string): boolean {
        if (process.env.FSX_DRIVE)
            return !!p.match(REMOTE_PATH_WITHOUT_DRIVE_REGEXP)

        return !!p.match(REMOTE_PATH_WITH_DRIVE_REGEXP)
    }

    public static parseRemotePath(p: string): ParsedRemotePath {
        if (process.env.FSX_DRIVE) {
            const match = p.match(REMOTE_PATH_WITHOUT_DRIVE_REGEXP)
            return { driveId: process.env.FSX_DRIVE, remotePath: match[1].replaceAll('+', ' ') }
        }
    
        const match = p.match(REMOTE_PATH_WITH_DRIVE_REGEXP)
        return { driveId: match[1], remotePath: match[2].replaceAll('+', ' ') }
    }

    /**
     * Converts a byte count to a human-readable file size.
     */
    public static fileSize(bytes: number): string {
        if (bytes == 0) { return "0.00 B"; }
        var e = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes/Math.pow(1024, e)).toFixed(2)+' '+' KMGTP'.charAt(e)+'B';
    }

    /**
     * Takes a maximum amount and a value, and returns a progress bar.
     * Example: progressBar(30, 100) -> `[===-------] 30%`
     */
    public static progressBar(value: number, max: number, barLength: number = 15): string {
        var segments = '-'.repeat(barLength).split('')
        var percentage = Math.floor(value / max * 100)
        var maxIndex = Math.floor(value / max * barLength)
    
        for (var i = 0; i < maxIndex; i++) {
            segments[i] = '='
        }
    
        return `[${segments.join('')}] ${percentage.toString().padStart(3)}%`
    }
}