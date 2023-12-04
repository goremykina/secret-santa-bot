import fs from 'fs';
import { User } from "./user"

const filePath = './users.json';

export const get = (): User[] => {
    if (!fs.existsSync(filePath))
        return [];

    const fileContent = fs.readFileSync(filePath, 'utf8');
    return fileContent ? JSON.parse(fileContent) : [];
}

export const save = (users: User[]): void => {
    const fileContent = JSON.stringify(users);
    fs.writeFileSync(filePath, fileContent)
}
