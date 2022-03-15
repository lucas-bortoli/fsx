import { Entry } from '@lucas-bortoli/libdiscord-fs'

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
}