export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let startIndex = 0; startIndex < array.length; startIndex += size) {
        const currentChunk: T[] = []
        const endIndex = Math.min(startIndex + size, array.length);

        for (let index = startIndex; index < endIndex; index++) {
            currentChunk.push(array[index])
        }

        chunks.push(currentChunk)
    }

    return chunks;
}

export function random<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

export function toMap<TKey, TItem>(array: TItem[], keySelector: (item: TItem) => TKey): Map<TKey, TItem> {
    return array.reduce((map, item) => {
        const key = keySelector(item);
        map.set(key, item);
        return map;
    }, new Map<TKey, TItem>())
}

export function shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }

    return newArray;
}
