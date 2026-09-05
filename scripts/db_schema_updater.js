import sqlite3 from 'sqlite3';

// Connect to the database
async function connect()
{
    return new Promise((resolve, reject) => {
        let db = new sqlite3.Database('database.db', (err) =>
        {
            if (err)
                reject();
            else
                resolve(db);
        })
    })
}

async function renamePinnedField(projectId, data)
{
    return new Promise((resolve, reject) => {
        db.run(
            `ALTER TABLE projects RENAME COLUMN pinned TO featured;`,
            [],
            function (err, rows)
            {
                if (err)
                    return reject('failed to rename pinned field');

                resolve(true);
            }
        );
    });
}

async function addAccessField(projectId, data)
{
    return new Promise((resolve, reject) => {
        db.run(
            `ALTER TABLE users ADD COLUMN access STRING NOT NULL DEFAULT 'default';`,
            [],
            function (err, rows)
            {
                if (err)
                    return reject('failed to add access field');

                resolve(true);
            }
        );
    });
}

async function giveMaximeAdmin(projectId, data)
{
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE users SET access = 'admin' WHERE username == 'maximecb';`,
            [],
            function (err, rows)
            {
                if (err)
                {
                    console.log(err);
                    return reject('failed to give maxime admin');
                }

                resolve(true);
            }
        );
    });
}

let db = await connect();
console.log(db);

await renamePinnedField();
await addAccessField();
await giveMaximeAdmin();

db.close();
