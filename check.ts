import Fs from 'fs/promises';
import DotEnv from 'dotenv';
import {
  AccountFollowersFeedResponseUsersItem,
  AccountFollowingFeedResponseUsersItem,
  Feed,
  IgApiClient
} from 'instagram-private-api';

DotEnv.config({ path: '.env' });

const {
  IG_USERNAME = '',
  IG_PASSWORD = ''
} = process.env;

/**
 * @see: https://github.com/dilame/instagram-private-api/issues/969#issuecomment-551436680
 * @param feed
 * @returns Promise<T[]> - T is the type of all feed items.
 */
async function getAllItemsFromFeed<T>(feed: Feed<any, T>) {
  let items: T[] = [];

  do {
    const feedItems = await feed.items();
    items = items.concat(feedItems);
  } while (feed.isMoreAvailable());

  return items;
}

/**
 * Store users data into a json file.
 * Wanna to get detail of users? just pass the 'data' through JSON.stringify instead of 'mappedData'
 * @param fileName
 * @param data
 * @returns Promise<void>
*/
function storeJSON(fileName: string, data: AccountFollowingFeedResponseUsersItem[]|AccountFollowersFeedResponseUsersItem[]) {
  const mappedData = data.map((user) => user.username);
  return Fs.writeFile(fileName, JSON.stringify(mappedData, null, 2));
}

async function main() {
  console.info('> Setup Instagram Client...');
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  await ig.simulate.preLoginFlow();

  if (!IG_USERNAME || !IG_PASSWORD) throw new Error('`IG_USERNAME` or `IG_PASSWORD` must be set on `.env` file');

  console.info(`> Authenticating into ${IG_USERNAME} account...`);
  const credentials = await ig.account.login(IG_USERNAME, IG_PASSWORD);
  const followersFeed = ig.feed.accountFollowers(credentials.pk);
  const followingFeed = ig.feed.accountFollowing(credentials.pk);

  console.info('> Getting followers/following concurrently...');
  const [followers, following] = await Promise.all([
    getAllItemsFromFeed<AccountFollowersFeedResponseUsersItem>(followersFeed),
    getAllItemsFromFeed<AccountFollowingFeedResponseUsersItem>(followingFeed)
  ]);

  console.info('> Making a new map of followers/following username...');
  const followerUsers = new Set(followers.map(({ username }) => username));
  const followingUsers = new Set(following.map(({ username }) => username));

  console.info('> Checking friendship...');
  const mutual = following.filter(({ username }) => followerUsers.has(username));
  const notFollowbackYou = following.filter(({ username }) => !followerUsers.has(username));
  const notGetYourFollowback = followers.filter(({ username }) => !followingUsers.has(username));

  console.info('> Storing users into json file concurrently...');
  await Promise.all([
    storeJSON('./data/followers.json', followers),
    storeJSON('./data/following.json', following),
    storeJSON('./data/mutual.json', mutual),
    storeJSON('./data/not-followback-you.json', notFollowbackYou),
    storeJSON('./data/not-get-your-followback.json', notGetYourFollowback)
  ]);
  console.info(`> Followers count: ${followers.length}`);
  console.info(`> Following count: ${following.length}`);
  console.info(`> Mutual count: ${mutual.length}`);
  console.info(`> Not followback you count: ${notFollowbackYou.length}`);
  console.info(`> Not get your followback count: ${notGetYourFollowback.length}`);
  console.info('> Done!');
}

main();
