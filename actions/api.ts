function graphql({ data, githubToken }: { data: string; githubToken: string }) {
  return fetch("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query: data }),
    headers: { Authorization: `Bearer ${githubToken}` },
  }).then((res) => res.json());
}

async function getLabelId(
  { labelName, owner, repoName, githubToken }: {
    labelName: string;
    owner: string;
    repoName: string;
    githubToken: string;
  },
) {
  const res = await graphql(
    {
      data: `
{
  repository(owner: "${owner}", name: "${repoName}") {
    label(name: "${labelName}") {
      id
    }
  }
}`,
      githubToken,
    },
  );
  return res.data.repository.label.id as string;
}

export async function addLabel(
  { labelName, owner, repoName, discussionId, githubToken }: {
    labelName: string;
    owner: string;
    repoName: string;
    discussionId: string;
    githubToken: string;
  },
) {
  const labelId = await getLabelId({ labelName, owner, repoName, githubToken });
  await graphql(
    {
      data: `
mutation {
  addLabelsToLabelable(
    input: {labelableId: "${discussionId}", labelIds: ["${labelId}"]}
  ) {
    clientMutationId
  }
}`,
      githubToken,
    },
  );
}

function queryEncode(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export async function addComment({ body, discussionId, githubToken }: {
  body: string;
  discussionId: string;
  githubToken: string;
}) {
  await graphql(
    {
      data: `
mutation {
  addDiscussionComment(input: { discussionId: "${discussionId}", body: "${
        queryEncode(
          body,
        )
      }" }) {
    clientMutationId
  }
}`,
      githubToken,
    },
  );
}

export async function clearLabel({ githubToken, discussionId }: {
  githubToken: string;
  discussionId: string;
}) {
  await graphql(
    {
      data: `
mutation {
  clearLabelsFromLabelable(input: {labelableId: "${discussionId}"}) {
    clientMutationId
  }
}`,
      githubToken,
    },
  );
}

export async function rmLabel(
  { labelName, discussionId, githubToken, owner, repoName }: {
    labelName: string;
    discussionId: string;
    githubToken: string;
    owner: string;
    repoName: string;
  },
) {
  const labelId = await getLabelId({ labelName, githubToken, owner, repoName });
  await graphql(
    {
      data: `
mutation {
  removeLabelsFromLabelable(
    input: {labelableId: "${discussionId}", labelIds: ["${labelId}"]}
  ) {
    clientMutationId
  }
}`,
      githubToken,
    },
  );
}

export function listRepositoryWorkflows(githubToken: string) {
  return fetch("https://api.github.com/repos/OWNER/REPO/actions/workflows", {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}
