import discord
import asyncio
from discord.ext import commands
import nest_asyncio
import logging
import os
import requests

# 使用 logging.info()、logging.error() 等替代 print()
logging.basicConfig(level=logging.INFO)
# 应用 nest_asyncio
nest_asyncio.apply()

# GitHub API 配置
github_api = "https://api.github.com/graphql"
repo = os.getenv("repo")
github_token = os.getenv("github_token")
discussion_id = os.getenv("discussion_id")
discussion_number = int(os.getenv("discussion_number"))
discussion_title = os.getenv("discussion_title")
discussion_body = os.getenv("discussion_body")
owner = repo.split("/")[0]
repo_name = repo.split("/")[1]

# Discord 配置
discord_token = os.getenv("discord_token")
channel_id = int(os.getenv("channel_id"))
target_user_id = int(os.getenv("target_user_id"))


def add_label(label_name: str):
    label_id = get_label_id(label_name)
    logging.info(f"Adding label {label_name} to discussion {discussion_id}")
    graphql(
        f"""
mutation {{
    addLabelsToLabelable(
        input: {{labelableId: "{discussion_id}", labelIds: ["{label_id}"]}}
    ) {{
        clientMutationId
    }}
}}
"""
    )


async def main():
    try:
        await client.start(discord_token)
    except discord.errors.LoginFailure as e:
        logging.error(f"Login failed: {e}")
    except discord.errors.HTTPException as e:
        logging.error(f"HTTP Exception occurred: {e}")
    except Exception as e:
        logging.error(f"Unexpected error: {e}")


async def fetch_and_process_discussions():
    msg = f"""讨论 ID：{discussion_number}
标题：{discussion_title}
［论坛内容］：{discussion_body}
［评论内容：好 or 普通 or 差 or 无法判断］"""
    channel = client.get_channel(channel_id)
    while True:
        await channel.send(msg)
        logging.info("Sent message to channel")

        def check(m):
            return m.author.id == target_user_id and m.channel.id == channel_id

        db_lock = asyncio.Lock()
        async with db_lock:
            try:
                while True:
                    logging.info("Waiting for reply...")
                    reply = await client.wait_for(
                        "message",
                        timeout=200.0,
                        check=check,
                    )
                    await channel.send(f"收到回复: {reply.content}")

                    fairy_type = "其他"
                    if "无法判断" in reply.content:
                        fairy_type = "低质"
                        add_label(fairy_type)
                    elif "普通" in reply.content:
                        fairy_type = "普通"
                        add_label(fairy_type)
                    elif "好" in reply.content:
                        fairy_type = "高质"
                        add_label(fairy_type)
                    elif "差" in reply.content:
                        fairy_type = "风险"
                        add_label(fairy_type)
                    elif "等待" in reply.content:
                        await asyncio.sleep(15)
                        continue

                    await client.close()

            except asyncio.TimeoutError:
                await channel.send(
                    f"没有收到回复，重新发送讨论 ID {discussion_number} 。"
                )


def get_label_id(label_name: str) -> str:
    logging.info(f"Getting label ID for {label_name}")
    response = graphql(
        f"""
{{
    repository(owner: "{owner}", name: "{repo_name}") {{
        label(name: "{label_name}") {{
            id
        }}
    }}
}}
        """
    )
    return response.json()["data"]["repository"]["label"]["id"]


def graphql(data: str):
    return requests.post(github_api, json=({"query": data}))


add_label("待审核")
intents = discord.Intents.default()
intents.message_content = True
client = commands.Bot(command_prefix="!", intents=intents)
client.run(discord_token)


@client.event
async def on_error(event, *args, **kwargs):
    logging.error(f"Error occurred in {event}: {args} - {kwargs}")
    await asyncio.sleep(5)
    try:
        await client.close()
        await client.start(discord_token)
    except Exception as e:
        logging.error(f"Reconnection failed: {e}")


@client.event
async def on_ready():
    logging.info(f"Logged in as {client.user}")
    await fetch_and_process_discussions()
