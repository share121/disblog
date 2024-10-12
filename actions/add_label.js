"use strict";

const { env } = require("process");
const { githubToken, discussionId, repo } = env,
  [owner, repoName] = repo.split("/");

/** @param {string} data */
function graphql(data) {
  return fetch("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query: data }),
    headers: { Authorization: `Bearer ${githubToken}` },
  }).then((res) => res.json());
}

async function clearLabel() {
  await graphql(
    `
mutation {
  clearLabelsFromLabelable(input: {labelableId: "${discussionId}"}) {
    clientMutationId
  }
}`
  );
}

/** @param {string} labelName @returns {Promise<string>} */
async function getLabelId(labelName) {
  const res = await graphql(
    `
{
  repository(owner: "${owner}", name: "${repoName}") {
    label(name: "${labelName}") {
      id
    }
  }
}`
  );
  return res.data.repository.label.id;
}

/** @param {string} labelName */
async function addLabel(labelName) {
  const labelId = await getLabelId(labelName);
  await graphql(
    `
mutation {
  addLabelsToLabelable(
    input: {labelableId: "${discussionId}", labelIds: ["${labelId}"]}
  ) {
    clientMutationId
  }
}`
  );
}

clearLabel();
addLabel("待审核");
