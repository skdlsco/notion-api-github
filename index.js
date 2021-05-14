const {Octokit} = require("octokit")
const dotenv = require("dotenv")
const {Client} = require("@notionhq/client");
dotenv.config();

const octokit = new Octokit({auth: process.env.GITHUB_KEY})
const notion = new Client({auth:process.env.NOTION_KEY}); 

const issue_database_id = process.env.ISSUE_DATABASE_ID;
const pull_database_id = process.env.PULL_DATABASE_ID;

function issueToProperties(issue_number, issues_details){
    return ({
        "State": {"name": issues_details.state},
        "Issue Number": parseInt(issue_number),
        "Name": [ { "text": {"content" : issues_details.title} } ],
        "Labels" : issues_details.labels,
    });
}

function pullToProperties(pull_number, pull_details){
    return ({
        "State": {"name": pull_details.state},
        "Request Number": parseInt(pull_number),
        "Name": [ { "text": {"content" : pull_details.title} } ],
        "Labels" : pull_details.labels,
    });
}

async function syncIssuesWithDatabase(){
    console.log("Syncing GitHub Issues with Notion Database")
    const issuesInDatabase = await getIssuesFromDatabse(); 
    // console.log(issuesInDatabase);
    //Get a list of github issues and add them to a local store
    let gitHubIssues = {}; 

    const issueIterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        state: "all",
        owner: process.env.GITHUB_REPO_OWNER,
        repo:process.env.GITHUB_REPO_NAME, 
        per_page: 100
    }); 
    for await (const {data: issues} of issueIterator) {
        for (const issue of issues) {
            const labels = issue.labels.map(label => ({ "name": label.name }));
            gitHubIssues[issue.number] = {
                "id": issue.id, 
                "title": issue.title, 
                "state": issue.state,
                "labels": labels,
            }
        }
    }
    //Create new issues or update existing in a Notion Database
    for (const [key,value] of Object.entries(gitHubIssues)){
        const issue_number = key 
        const issues_details = value
        const properties = issueToProperties(issue_number, issues_details);
        //If the issue does not exist in the database yet, add it to the database
        if(!(issue_number in issuesInDatabase)){
            await notion.request({
                path:'pages', 
                method:"POST", 
                body:{
                    "parent": { "database_id": issue_database_id},
                    "properties": properties
                }
            })
        } else 
        //This issue already exists in the database so we want to update the page
        {
            await notion.request({
                path:'pages/'+issuesInDatabase[issue_number].page_id,
                method:'patch', 
                body:{
                    "properties": properties
                }
            });
        }
    }
    //Run this function every five minutes
    setTimeout(syncIssuesWithDatabase, 5*60*1000)
}


async function syncPullsWithDatabase(){
    console.log("Syncing GitHub Pulls with Notion Database")
    const pullsInDatabase = await getPullsFromDatabse(); 
    // console.log(issuesInDatabase);
    //Get a list of github issues and add them to a local store
    let gitHubPulls= {}; 

    const pullIterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
        state: "all",
        owner: process.env.GITHUB_REPO_OWNER,
        repo:process.env.GITHUB_REPO_NAME, 
        per_page: 100
    }); 

    for await (const {data: pulls} of pullIterator) {
        for (const pull of pulls) {
            const labels = pull.labels.map(label => ({ "name": label.name }));
            gitHubPulls[pull.number] = {
                "id": pull.id, 
                "title": pull.title, 
                "state": pull.state,
                "labels": labels
            }
        }
    }
    //Create new issues or update existing in a Notion Database
    for (const [key,value] of Object.entries(gitHubPulls)){
        const pull_number = key 
        const pull_details = value
        const properties = pullToProperties(pull_number, pull_details);
        //If the issue does not exist in the database yet, add it to the database
        if(!(pull_number in pullsInDatabase)){
            await notion.request({
                path:'pages', 
                method:"POST", 
                body:{
                    "parent": { "database_id": pull_database_id},
                    "properties": properties
                }
            })
        } else 
        //This issue already exists in the database so we want to update the page
        {
            await notion.request({
                path:'pages/'+pullsInDatabase[pull_number].page_id,
                method:'patch', 
                body:{
                    "properties": properties
                }
            });
        }
    }
    //Run this function every five minutes
    setTimeout(syncPullsWithDatabase, 5*60*1000)
}

(async () => {
    syncPullsWithDatabase(); 
})();

(async () => {
    syncIssuesWithDatabase(); 
})();

//Get a paginated list of Tasks currently in a the database. 
async function getPullsFromDatabse() {

    const pulls = {}; 

    async function getPageOfPulls(cursor){
        let request_payload = "";
        //Create the request payload based on the presense of a start_cursor
        if(cursor == undefined){
            request_payload = {
                path:'databases/' + pull_database_id + '/query', 
                method:'POST',
            }
        } else {
            request_payload= {
                path:'databases/' + pull_database_id + '/query', 
                method:'POST',
                body:{
                    "start_cursor": cursor
                }
            }
        }
        //While there are more pages left in the query, get pages from the database. 
        const current_pages = await notion.request(request_payload)
        
        for(const page of current_pages.results){
            pulls[page.properties["Request Number"].number] = {
                "page_id": page.id, 
            }
        }
        if(current_pages.has_more){
            await getPageOfPulls(current_pages.next_cursor)
        }
        
    }
    await getPageOfPulls();
    return pulls; 
}; 

async function getIssuesFromDatabse() {

    const issues = {}; 

    async function getPageOfIssues(cursor){
        let request_payload = "";
        //Create the request payload based on the presense of a start_cursor
        if(cursor == undefined){
            request_payload = {
                path:'databases/' + issue_database_id + '/query', 
                method:'POST',
            }
        } else {
            request_payload= {
                path:'databases/' + issue_database_id + '/query', 
                method:'POST',
                body:{
                    "start_cursor": cursor
                }
            }
        }
        //While there are more pages left in the query, get pages from the database. 
        const current_pages = await notion.request(request_payload)
        
        for(const page of current_pages.results){
            issues[page.properties["Issue Number"].number] = {
                "page_id": page.id, 
            }
        }
        if(current_pages.has_more){
            await getPageOfIssues(current_pages.next_cursor)
        }
        
    }
    await getPageOfIssues();
    return issues; 
}; 