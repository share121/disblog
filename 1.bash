#!/bin/bash

# 设置环境变量
OWNER=$(echo $REPO | cut -d"/" -f1)
REPO_NAME=$(echo $REPO | cut -d"/" -f2)

# 定义 GraphQL 请求函数
graphql_request() {
  curl "https://api.github.com/graphql" -H "authorization: Bearer $GITHUB_TOKEN" --data-raw "{\"query\":\"$1\"}"
}

# 清除讨论上的所有标签
clear_labels() {
  graphql_request "mutation { clearLabelsFromLabelable(input: {labelableId: \"$DISCUSSION_ID\"}) { clientMutationId } }"
}

# 获取标签ID
get_label_id() {
  echo graphql_request "{ repository(owner: \"$OWNER\", name: \"$REPO_NAME\") { label(name: \"$1\") { id } } }" | jq -r ".data.repository.label.id"
}

# 添加标签到讨论
add_label() {
  LABEL_ID=$(get_label_id $1)
  echo $LABEL_ID
  graphql_request "mutation { addLabelsToLabelable(input: {labelableId: \"$DISCUSSION_ID\", labelIds: [\"$LABEL_ID\"]}) { clientMutationId } }" | jq -r ".data.addLabelsToLabelable.clientMutationId"
}

# 执行清除标签操作
clear_labels

# 添加 "待审核" 标签
add_label "待审核"
