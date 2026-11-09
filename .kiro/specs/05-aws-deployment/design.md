# Design: aws-deployment

## Resource map of the `skeleton-crew` stack

| Template section | Spec | Resources |
|---|---|---|
| 1. Web portal | 02 | `UserPool`, `UserPoolClient`, `PortalApi` |
| 2. Knowledge base | 03 | `KnowledgeDocsBucket`, `KnowledgeDocsBucketCleaner`, `KnowledgeBaseRole`, `KnowledgeBase`, `KnowledgeDataSource`, `GatewayRole`, `Gateway`, `GatewayTarget`, `HarnessRole`, `Harness`, `KbChatLogGroup`, `KbChatRole`, `KbChatFunction` |
| 3. Policy agent | 04 | `PoliciesBucket`, `AgentCodeBucket`, `AgentPackageLayer`, `CustomResource*`, `PoliciesBucketCleaner`, `AgentCodeBucketCleaner`, `AgentPackage`, `AgentCoreExecutionRole`, `AgentCoreRuntime`, `RuntimeLogGroup`, `Proxy*` |

## Decisions

- **Flat template, not nested**: role and function names use `${AWS::StackName}`; in a nested stack the name would be long and exceed IAM's 64-character limit.
- **Merge of `knowledge-base-creation`**: the base's role and policy, the Gateway, the GatewayTarget, the Harness and their policies are kept as they are. Changes: names derived from the stack (no fixed bucket or role names), bucket emptied automatically on deletion, and the dedicated HTTP API was replaced by the `POST /knowledge-base/chat` route of `PortalApi`. The Lambda now uses arm64 and a log group declared in the template.
- **Public API**: no authorizer and with CORS `*`, by project decision. Risk: anyone with the URL can consume Bedrock. Minimal mitigation: `ThrottlingRateLimit: 5` and `ThrottlingBurstLimit: 10`. If you later want to protect it, just add `Auth` with a Cognito JWT authorizer to `PortalApi` and send `Authorization` again from `src/shared/api.js`.
- **No `AllowedOrigins` parameter**: it is no longer necessary to register the Netlify URLs of `web/` and `pwa/`.
- **No `Export`** in the Outputs: nobody imports values between stacks.
- **`disable_rollback = true`**: if something fails, the stack stays in `CREATE_FAILED` so it can be diagnosed with `describe-stack-events`; it must be deleted before retrying (`sam delete`, with authorization).
- **Cognito `UserPoolAddOns: AUDIT`** is kept from the original tested template. If CloudFormation rejects it, remove that block.
- **New AgentCore resources** (`Gateway`, `GatewayTarget`, `Harness`, `MANAGED` connector): `sam validate --lint` accepts them, but their actual creation is only confirmed on deployment; the original template had already created them in this account.
- **Everything inside the stack**: no project resource is created outside `skeleton-crew`. That is why the data source uses `DataDeletionPolicy: DELETE` (with `RETAIN` the managed index was left orphaned when the stack was deleted), buckets are emptied with custom resources before being deleted and log groups are declared with retention. Knowledge base ingestion is an action (not a resource) that is launched by hand.
- **Only known exception**: the SAM artifacts bucket (`resolve_s3 = true`, stack `aws-sam-cli-managed-default`). SAM needs it *before* creating the stack to upload the code, so it cannot be part of it; it is shared by all SAM projects in the account. `sam delete` deletes the stack's objects in that bucket, but not the bucket. It is the only exception and is mentioned when the stack is destroyed.
- **Test user**: created with the CLI (not as a template resource) so as not to write a password in the repository. It lives inside the `UserPool`, so it disappears with the stack.

## Deployment steps (run by Kiro, see tasks)

```
sam validate --lint        # cwd: infra
sam build                  # cwd: infra
sam deploy                 # cwd: infra, after authorization
aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1 --query "Stacks[0].Outputs"
```

## `.env.local` generation

The frontend is two standalone apps, each with its own `.env.local`. **The same content** is written to `web/.env.local` and to `pwa/.env.local` (there is no `.env.local` at the root). Format (one variable per line, no quotes), with the values from the Outputs:

```
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
VITE_CHAT_API_URL=<ChatApiUrl>
VITE_POLICY_API_URL=<GeneratePolicyUrl>
```

## Test user

It is created **after** the deployment, once `UserPool` and `UserPoolClient` exist, with a single authorization (the same one as task 5). Fixed data:

| Field | Value |
|---|---|
| Email (username) | `test@gmail.com` |
| Nickname | `demoKiroween2026` |
| Temporary password | The one the user provides in the chat. If they provide none, generate a 16-character one that meets the policy (uppercase, lowercase, number and symbol), for example with `python3 -c "import secrets,string; a=string.ascii_letters+string.digits; print(''.join(secrets.choice(a) for _ in range(12))+'Aa1!')"`. |

The password is **not written to any file** (`aws-security` rule); it is only shown in the chat.

```
aws cognito-idp admin-create-user --region us-east-1 --user-pool-id <UserPoolId> --username test@gmail.com --user-attributes Name=email,Value=test@gmail.com Name=nickname,Value=demoKiroween2026 Name=email_verified,Value=true --temporary-password '<temporary>' --message-action SUPPRESS
```

After creating it, Kiro **shows the user** this information so they can type it into the login:

> Test user created. Run `npm run dev` in `web/` (http://localhost:5173) or in `pwa/` (http://localhost:5174) and sign in with:
> - Email: `test@gmail.com`
> - Temporary password: `<the one used>`
>
> On the first sign-in the login asks you for a new password (the nickname `demoKiroween2026` is already assigned), then to scan the QR with your authenticator app and type the 6-digit code.


## Verification after destroying

`sam delete` finishes when the stack no longer exists; Kiro also confirms (read-only) that nothing from the project is left outside it. Each command filters by the stack prefix (`skeleton`), because the account may contain resources from other projects with different fields and dates:

```
aws s3 ls | grep skeleton-crew
aws logs describe-log-groups --region us-east-1 --query "logGroups[?contains(logGroupName,'skeleton')].logGroupName" --output text
aws bedrock-agentcore-control list-agent-runtimes --region us-east-1 --query "agentRuntimes[?contains(agentRuntimeName,'skeleton')].agentRuntimeName" --output text
aws bedrock-agentcore-control list-harnesses --region us-east-1 --query "harnesses[?contains(harnessName,'skeleton')].harnessName" --output text
aws bedrock-agentcore-control list-gateways --region us-east-1 --query "items[?contains(name,'skeleton')].name" --output text
aws bedrock-agent list-knowledge-bases --region us-east-1 --query "knowledgeBaseSummaries[?contains(name,'skeleton')].[knowledgeBaseId,name]" --output text
aws bedrock-agentcore-control list-memories --region us-east-1 --query "memories[].[id,createdAt]" --output text
```

The first six must come out empty. `list-memories` has no name filter: only a memory created during the stack's lifetime counts (compare it with the deployment date); those from other projects are ignored. If anything with the stack prefix appears, report it to the user. Remember that `knowledgeBaseSummaries` uses the `knowledgeBaseId` field (not `id`): a filter with a nonexistent field returns empty even if the resource exists.

## Files produced by this spec

Exact content. Create as is.

#### `infra/template.yaml`

````yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Description: >
  Kiroween 2026 — single stack:
  Cognito (login + TOTP MFA) · public HTTP API · Managed knowledge base
  (Bedrock Knowledge Base + MCP Gateway + AgentCore Harness + chat Lambda) ·
  IAM policy generator agent (Strands on AgentCore Runtime, direct code
  deployment, no containers). `sam build` + `sam deploy` creates everything; `sam delete`
  removes it without orphans.

# ─── Parameters ────────────────────────────────────────────────────────────────
Parameters:

  AgentRuntimeName:
    Type:    String
    Default: skeleton_iam_policy_agent
    AllowedPattern: "^[a-zA-Z][a-zA-Z0-9_]{0,47}$"
    Description: Name of the AgentCore Runtime (letters, numbers and underscore only)

  HarnessName:
    Type:    String
    Default: skeletonKbHarness
    AllowedPattern: "^[a-zA-Z][a-zA-Z0-9_]{0,39}$"
    Description: Name of the AgentCore Harness (managed agent)

  HarnessModelId:
    Type:    String
    Default: global.anthropic.claude-sonnet-4-6
    Description: ID of the global model used by the Harness (Claude Sonnet 4.6)

  HarnessTemperature:
    Type:    Number
    Default: 0.3
    Description: Temperature of the Harness model

  BedrockModelId:
    Type:    String
    Default: us.anthropic.claude-sonnet-4-5-20250929-v1:0
    Description: Bedrock Model ID / inference profile that the policy agent will use

  PresignedTtlSeconds:
    Type:    Number
    Default: 3600
    Description: TTL in seconds of the S3 presigned URL

  LogRetentionInDays:
    Type:    Number
    Default: 30
    AllowedValues: [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365]
    Description: Retention of all log groups in the stack

Resources:

  # ═══════════════════════════════════════════════════════════════════════════
  # 1. WEB PORTAL — Cognito + API
  # ═══════════════════════════════════════════════════════════════════════════

  # Email login, mandatory TOTP MFA, no self-registration (only admins create users)
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: kiroween-2026
      UsernameAttributes:
        - email
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: true
        InviteMessageTemplate:
          EmailMessage: "Your username is {username} and your temporary password is {####}"
          EmailSubject: "Invitation to kiroween-2026"
      Schema:
        - Name: email
          AttributeDataType: String
          Required: true
          Mutable: true
        - Name: nickname
          AttributeDataType: String
          Required: true
          Mutable: true
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireUppercase: true
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: true
      MfaConfiguration: "ON"
      EnabledMfas:
        - SOFTWARE_TOKEN_MFA
      AutoVerifiedAttributes:
        - email
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      UserPoolAddOns:
        AdvancedSecurityMode: AUDIT

  # App Client for SPA (no secret, SRP flow)
  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: kiroween-2026-spa
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      AccessTokenValidity: 1
      IdTokenValidity: 1
      RefreshTokenValidity: 1
      TokenValidityUnits:
        AccessToken: hours
        IdToken: hours
        RefreshToken: hours
      ReadAttributes:
        - email
        - nickname
        - email_verified
      WriteAttributes:
        - email
        - nickname
      PreventUserExistenceErrors: ENABLED

  # Single portal API: PUBLIC (no authentication) and with CORS open to any origin.
  # Access to the interface is controlled by the Cognito login; rate limiting
  # protects against excessive Bedrock consumption.
  PortalApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName:   "$default"
      Description: "Public portal API (knowledge chat and IAM policy generator)"
      CorsConfiguration:
        AllowOrigins:
          - "*"
        AllowMethods:
          - POST
          - OPTIONS
        AllowHeaders:
          - Content-Type
        AllowCredentials: false
        MaxAge: 300
      DefaultRouteSettings:
        ThrottlingBurstLimit: 10
        ThrottlingRateLimit:  5
      Tags:
        Project: kiroween-2026

  # ═══════════════════════════════════════════════════════════════════════════
  # 2. KNOWLEDGE BASE — S3 + managed KB + Gateway + Harness + Lambda
  #    (migrated from knowledge-base-creation)
  # ═══════════════════════════════════════════════════════════════════════════

  # Step 1: bucket with the documents (no fixed name; emptied automatically when the stack is deleted)
  KnowledgeDocsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
            BucketKeyEnabled: true
      PublicAccessBlockConfiguration:
        BlockPublicAcls:       true
        BlockPublicPolicy:     true
        IgnorePublicAcls:      true
        RestrictPublicBuckets: true
      Tags:
        - Key:   Project
          Value: kiroween-2026

  KnowledgeDocsBucketCleaner:
    Type: Custom::EmptyBucket
    Properties:
      ServiceToken: !GetAtt CustomResourceFunction.Arn
      Action:       EmptyBucket
      BucketName:   !Ref KnowledgeDocsBucket

  # Step 2: managed knowledge base (managed embedding, no vector store)
  KnowledgeBaseRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "kb-role-${AWS::StackName}"
      Description: Execution role of the managed knowledge base
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: bedrock.amazonaws.com
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                aws:SourceAccount: !Ref AWS::AccountId
              ArnLike:
                aws:SourceArn: !Sub 'arn:aws:bedrock:${AWS::Region}:${AWS::AccountId}:knowledge-base/*'
      Policies:
        - PolicyName: knowledge-base-s3
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: S3ListBucket
                Effect: Allow
                Action: s3:ListBucket
                Resource: !GetAtt KnowledgeDocsBucket.Arn
                Condition:
                  StringEquals:
                    aws:ResourceAccount: !Ref AWS::AccountId
              - Sid: S3GetObject
                Effect: Allow
                Action: s3:GetObject
                Resource: !Sub '${KnowledgeDocsBucket.Arn}/*'
                Condition:
                  StringEquals:
                    aws:ResourceAccount: !Ref AWS::AccountId
              - Sid: CloudWatchWrite
                Effect: Allow
                Action: cloudwatch:PutMetricData
                Resource: '*'
                Condition:
                  StringEquals:
                    cloudwatch:namespace: AWS/Bedrock/KnowledgeBases

  KnowledgeBase:
    Type: AWS::Bedrock::KnowledgeBase
    Properties:
      Name: !Sub "kiroween-2026-kb-${AWS::StackName}"
      Description: Managed knowledge base of the portal
      RoleArn: !GetAtt KnowledgeBaseRole.Arn
      KnowledgeBaseConfiguration:
        Type: MANAGED
        ManagedKnowledgeBaseConfiguration:
          EmbeddingModelType: MANAGED

  # S3 data source (managed connector): ingestion is started by hand with start-ingestion-job (see 03-knowledge-base).
  KnowledgeDataSource:
    Type: AWS::Bedrock::DataSource
    Properties:
      Name: !Sub "${AWS::StackName}-s3"
      KnowledgeBaseId: !Ref KnowledgeBase
      DataDeletionPolicy: DELETE
      DataSourceConfiguration:
        Type: MANAGED_KNOWLEDGE_BASE_CONNECTOR
        ManagedKnowledgeBaseConnectorConfiguration:
          ConnectorParameters:
            type: S3
            version: "1"
            connectionConfiguration:
              bucketName: !Ref KnowledgeDocsBucket
              bucketOwnerAccountId: !Ref AWS::AccountId
            deletionProtectionConfiguration:
              enableDeletionProtection: false

  # Step 3: MCP Gateway (inbound via IAM permissions) with the Knowledge Bases connector
  GatewayRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "kb-gateway-role-${AWS::StackName}"
      Description: Execution role of the AgentCore Gateway
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: bedrock-agentcore.amazonaws.com
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                aws:SourceAccount: !Ref AWS::AccountId
              ArnLike:
                aws:SourceArn: !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*'
      Policies:
        - PolicyName: kb-gateway-policy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              # AgenticRetrieveStream does not support resource scoping -> "*".
              - Sid: AgenticRetrieveStream
                Effect: Allow
                Action: bedrock:AgenticRetrieveStream
                Resource: '*'
              - Sid: RetrieveScoped
                Effect: Allow
                Action:
                  - bedrock:Retrieve
                  - bedrock:RetrieveAndGenerate
                  - bedrock:GetKnowledgeBase
                Resource:
                  - !GetAtt KnowledgeBase.KnowledgeBaseArn

  Gateway:
    Type: AWS::BedrockAgentCore::Gateway
    Properties:
      Name: !Sub "kb-gateway-${AWS::StackName}"
      Description: MCP gateway to the managed knowledge base
      AuthorizerType: AWS_IAM
      ProtocolType: MCP
      RoleArn: !GetAtt GatewayRole.Arn
      ProtocolConfiguration:
        Mcp:
          SearchType: SEMANTIC

  GatewayTarget:
    Type: AWS::BedrockAgentCore::GatewayTarget
    Properties:
      GatewayIdentifier: !Ref Gateway
      Name: kb-target
      Description: Target of the managed knowledge base connector
      TargetConfiguration:
        Mcp:
          Connector:
            Source:
              ConnectorId: bedrock-knowledge-bases
            Enabled:
              - AgenticRetrieveStream
            Configurations:
              - Name: AgenticRetrieveStream
                ParameterValues:
                  retrievers:
                    - configuration:
                        knowledgeBase:
                          knowledgeBaseId: !Ref KnowledgeBase
                  agenticRetrieveConfiguration:
                    foundationModelType: MANAGED
                    rerankingModelType: MANAGED
      CredentialProviderConfigurations:
        - CredentialProviderType: GATEWAY_IAM_ROLE

  # Step 4: Harness (managed agent) that uses the Gateway as a tool
  HarnessRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "kb-harness-role-${AWS::StackName}"
      Description: Execution role of the AgentCore Harness
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: bedrock-agentcore.amazonaws.com
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                aws:SourceAccount: !Ref AWS::AccountId
              ArnLike:
                aws:SourceArn: !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*'
      Policies:
        - PolicyName: kb-harness-policy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: MarketplaceModelSubscription
                Effect: Allow
                Action:
                  - aws-marketplace:Subscribe
                  - aws-marketplace:Unsubscribe
                  - aws-marketplace:ViewSubscriptions
                Resource: '*'
                Condition:
                  StringEquals:
                    aws:CalledViaLast: bedrock.amazonaws.com
              - Sid: InvokeClaudeModel
                Effect: Allow
                Action:
                  - bedrock:InvokeModel
                  - bedrock:InvokeModelWithResponseStream
                Resource:
                  - 'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6*'
                  - !Sub 'arn:aws:bedrock:*:${AWS::AccountId}:inference-profile/*claude-sonnet-4-6*'
              - Sid: InvokeGateway
                Effect: Allow
                Action:
                  - bedrock-agentcore:InvokeGateway
                Resource: !GetAtt Gateway.GatewayArn
              # The Harness creates and uses an AgentCore Memory resource for session context.
              - Sid: HarnessMemoryAccess
                Effect: Allow
                Action:
                  - bedrock-agentcore:CreateEvent
                  - bedrock-agentcore:GetEvent
                  - bedrock-agentcore:ListEvents
                  - bedrock-agentcore:DeleteEvent
                  - bedrock-agentcore:ListActors
                  - bedrock-agentcore:ListSessions
                  - bedrock-agentcore:RetrieveMemoryRecords
                  - bedrock-agentcore:GetMemoryRecord
                  - bedrock-agentcore:ListMemoryRecords
                  - bedrock-agentcore:GetMemory
                Resource:
                  - !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:memory/*'

  Harness:
    Type: AWS::BedrockAgentCore::Harness
    # The Gateway target must exist before the Harness uses it as a tool.
    DependsOn: GatewayTarget
    Properties:
      HarnessName: !Ref HarnessName
      ExecutionRoleArn: !GetAtt HarnessRole.Arn
      Model:
        BedrockModelConfig:
          ModelId: !Ref HarnessModelId
          Temperature: !Ref HarnessTemperature
          ApiFormat: converse_stream
      SystemPrompt:
        - Text: |
            Act as an agent specialized in answering questions oriented to the knowledge base to which you have access.
            If the user asks you other kinds of questions that are not related to the knowledge base you must answer that you have no
            information and that you cannot help them
      Tools:
        - Type: agentcore_gateway
          Name: knowledge-base-gateway
          Config:
            AgentCoreGateway:
              GatewayArn: !GetAtt Gateway.GatewayArn

  # Step 5: Lambda that invokes the Harness (route POST /knowledge-base/chat of PortalApi)
  KbChatLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName:    !Sub "/aws/lambda/kb-chat-${AWS::StackName}"
      RetentionInDays: !Ref LogRetentionInDays

  KbChatRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "kb-chat-role-${AWS::StackName}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: KbChatPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid:    OwnLogs
                Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !GetAtt KbChatLogGroup.Arn
              - Sid:    InvokeHarness
                Effect: Allow
                Action:
                  - bedrock-agentcore:InvokeHarness
                  - bedrock-agentcore:InvokeAgentRuntime
                Resource: !GetAtt Harness.Arn
      Tags:
        - Key:   Project
          Value: kiroween-2026

  KbChatFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName:  !Sub "kb-chat-${AWS::StackName}"
      Description:   "Invokes the AgentCore Harness with retries"
      CodeUri:       ./kb_chat/
      Handler:       lambda_function.lambda_handler
      Runtime:       python3.14
      Architectures: [arm64]
      Timeout:       60
      MemorySize:    512
      Role:          !GetAtt KbChatRole.Arn
      LoggingConfig:
        LogGroup:  !Ref KbChatLogGroup
        LogFormat: Text
      Environment:
        Variables:
          REGION:      !Ref AWS::Region
          HARNESS_ARN: !GetAtt Harness.Arn
          MAX_RETRIES: '3'
      Events:
        Chat:
          Type: HttpApi
          Properties:
            ApiId:  !Ref PortalApi
            Path:   /knowledge-base/chat
            Method: POST
      Tags:
        Project: kiroween-2026

  # ═══════════════════════════════════════════════════════════════════════════
  # 3. IAM POLICY GENERATOR AGENT — Strands on AgentCore Runtime
  # ═══════════════════════════════════════════════════════════════════════════

  # ── S3: policies bucket ─────────────────────────────────────────────────────
  PoliciesBucket:
    Type: AWS::S3::Bucket
    Properties:
      VersioningConfiguration:
        Status: Enabled
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      PublicAccessBlockConfiguration:
        BlockPublicAcls:       true
        BlockPublicPolicy:     true
        IgnorePublicAcls:      true
        RestrictPublicBuckets: true
      LifecycleConfiguration:
        Rules:
          - Id:     ExpireOldPolicies
            Status: Enabled
            ExpirationInDays: 90
            NoncurrentVersionExpiration:
              NoncurrentDays: 7
      Tags:
        - Key:   Project
          Value: iam-policy-agent

  # ── S3: agent code bucket (zip read by AgentCore) ────────────────────────────
  AgentCodeBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      PublicAccessBlockConfiguration:
        BlockPublicAcls:       true
        BlockPublicPolicy:     true
        IgnorePublicAcls:      true
        RestrictPublicBuckets: true
      Tags:
        - Key:   Project
          Value: iam-policy-agent

  # ── Agent package ────────────────────────────────────────────────────────────
  # `sam build` installs agent/requirements.txt as Linux arm64 wheels and copies
  # agent/ (agent.py + tools/) under python/. `sam deploy` uploads and publishes it.
  # RetentionPolicy Delete: old versions are not left orphaned.
  AgentPackageLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName:   !Sub "iam-policy-agent-pkg-${AWS::StackName}"
      Description: "Agent code + dependencies (source of the AgentCore zip)"
      ContentUri:  ./agent/
      CompatibleRuntimes:      [python3.14]
      CompatibleArchitectures: [arm64]
      RetentionPolicy: Delete
    Metadata:
      BuildMethod:       python3.14
      BuildArchitecture: arm64

  # ── Custom resources: support Lambda ─────────────────────────────────────────
  CustomResourceLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName:    !Sub "/aws/lambda/iam-policy-cr-${AWS::StackName}"
      RetentionInDays: !Ref LogRetentionInDays

  CustomResourceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "iam-policy-cr-role-${AWS::StackName}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: CustomResourcePolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              # Own logs: no CreateLogGroup so Lambda does not create groups outside the stack
              - Sid:    OwnLogs
                Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !GetAtt CustomResourceLogGroup.Arn
              - Sid:    ReadAgentLayer
                Effect: Allow
                Action: lambda:GetLayerVersion
                Resource: !Sub "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:layer:iam-policy-agent-pkg-${AWS::StackName}:*"
              - Sid:    WriteAgentCode
                Effect: Allow
                Action: s3:PutObject
                Resource: !Sub "${AgentCodeBucket.Arn}/*"
              - Sid:    EmptyBuckets
                Effect: Allow
                Action:
                  - s3:ListBucket
                  - s3:ListBucketVersions
                Resource:
                  - !GetAtt PoliciesBucket.Arn
                  - !GetAtt AgentCodeBucket.Arn
                  - !GetAtt KnowledgeDocsBucket.Arn
              - Sid:    DeleteObjects
                Effect: Allow
                Action:
                  - s3:DeleteObject
                  - s3:DeleteObjectVersion
                Resource:
                  - !Sub "${PoliciesBucket.Arn}/*"
                  - !Sub "${AgentCodeBucket.Arn}/*"
                  - !Sub "${KnowledgeDocsBucket.Arn}/*"
              - Sid:    ManageRuntimeLogGroup
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:PutRetentionPolicy
                  - logs:DeleteLogGroup
                Resource: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/runtimes/*"
      Tags:
        - Key:   Project
          Value: iam-policy-agent

  CustomResourceFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName:  !Sub "iam-policy-cr-${AWS::StackName}"
      Description:   "Custom resources: package agent, empty buckets, runtime log group"
      CodeUri:       ./custom_resource/
      Handler:       handler.handler
      Runtime:       python3.14
      Architectures: [arm64]
      Timeout:       600
      MemorySize:    1024
      EphemeralStorage:
        Size: 2048
      Role:          !GetAtt CustomResourceRole.Arn
      LoggingConfig:
        LogGroup:  !Ref CustomResourceLogGroup
        LogFormat: Text
      Tags:
        Project: iam-policy-agent

  # They empty the buckets (all versions) before CloudFormation deletes them.
  PoliciesBucketCleaner:
    Type: Custom::EmptyBucket
    Properties:
      ServiceToken: !GetAtt CustomResourceFunction.Arn
      Action:       EmptyBucket
      BucketName:   !Ref PoliciesBucket

  AgentCodeBucketCleaner:
    Type: Custom::EmptyBucket
    Properties:
      ServiceToken: !GetAtt CustomResourceFunction.Arn
      Action:       EmptyBucket
      BucketName:   !Ref AgentCodeBucket

  # Re-packages the layer (removes the python/ prefix) and uploads the agent zip.
  # Code changes → new layer version → new key → the runtime is updated.
  AgentPackage:
    Type: Custom::AgentPackage
    DependsOn: AgentCodeBucketCleaner
    Properties:
      ServiceToken:    !GetAtt CustomResourceFunction.Arn
      Action:          PackageAgent
      LayerVersionArn: !Ref AgentPackageLayer
      Bucket:          !Ref AgentCodeBucket
      KeyPrefix:       agent

  # ── IAM: AgentCore Runtime execution role ────────────────────────────────────
  AgentCoreExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "iam-policy-agentcore-role-${AWS::StackName}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid:    AssumeRolePolicy
            Effect: Allow
            Principal:
              Service: bedrock-agentcore.amazonaws.com
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                aws:SourceAccount: !Ref AWS::AccountId
              ArnLike:
                aws:SourceArn: !Sub "arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:*"
      Policies:

        - PolicyName: BedrockModelInvocation
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid:    BedrockModelInvocation
                Effect: Allow
                Action:
                  - bedrock:InvokeModel
                  - bedrock:InvokeModelWithResponseStream
                Resource:
                  - arn:aws:bedrock:*::foundation-model/*
                  - !Sub "arn:aws:bedrock:${AWS::Region}:${AWS::AccountId}:*"

        - PolicyName: S3PoliciesBucketPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid:    WritePolicies
                Effect: Allow
                Action:
                  - s3:PutObject
                  - s3:GetObject
                Resource: !Sub "${PoliciesBucket.Arn}/policies/*"

        - PolicyName: CloudWatchLogsPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - logs:DescribeLogStreams
                  - logs:CreateLogGroup
                Resource:
                  - !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/runtimes/*"
              - Effect: Allow
                Action:
                  - logs:DescribeLogGroups
                Resource:
                  - !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:*"
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource:
                  - !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"

        - PolicyName: XRayAndMetricsPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - xray:PutTraceSegments
                  - xray:PutTelemetryRecords
                  - xray:GetSamplingRules
                  - xray:GetSamplingTargets
                Resource: "*"
              - Effect: Allow
                Action: cloudwatch:PutMetricData
                Resource: "*"
                Condition:
                  StringEquals:
                    cloudwatch:namespace: bedrock-agentcore

        - PolicyName: WorkloadAccessTokenPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid:    GetAgentAccessToken
                Effect: Allow
                Action:
                  - bedrock-agentcore:GetWorkloadAccessToken
                  - bedrock-agentcore:GetWorkloadAccessTokenForJWT
                  - bedrock-agentcore:GetWorkloadAccessTokenForUserId
                Resource:
                  - !Sub "arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/default"
                  - !Sub "arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/default/workload-identity/${AgentRuntimeName}-*"

      Tags:
        - Key:   Project
          Value: iam-policy-agent

  # ── AgentCore Runtime ─────────────────────────────────────────────────────────
  # The DEFAULT endpoint and the workload identity are created by the service and
  # are deleted along with the runtime. Whoever runs the deploy needs
  # s3:GetObject on AgentCodeBucket (AgentCore reads the zip with those credentials).
  AgentCoreRuntime:
    Type: AWS::BedrockAgentCore::Runtime
    # On delete: the runtime is removed before the policies bucket is emptied.
    DependsOn: PoliciesBucketCleaner
    Properties:
      AgentRuntimeName: !Ref AgentRuntimeName
      Description:      "IAM Policy Generator agent — Strands Agents on AgentCore Runtime"
      AgentRuntimeArtifact:
        CodeConfiguration:
          Runtime:    PYTHON_3_14
          EntryPoint: [agent.py]
          Code:
            S3:
              Bucket: !GetAtt AgentPackage.Bucket
              Prefix: !GetAtt AgentPackage.Key
      RoleArn: !GetAtt AgentCoreExecutionRole.Arn
      NetworkConfiguration:
        NetworkMode: PUBLIC
      EnvironmentVariables:
        BEDROCK_MODEL_ID:      !Ref BedrockModelId
        POLICIES_BUCKET:       !Ref PoliciesBucket
        PRESIGNED_TTL_SECONDS: !Sub "${PresignedTtlSeconds}"
        LOG_LEVEL:             INFO
      LifecycleConfiguration:
        IdleRuntimeSessionTimeout: 300
      Tags:
        Project: iam-policy-agent

  # Log group that AgentCore uses for the DEFAULT endpoint
  # (/aws/bedrock-agentcore/runtimes/<runtimeId>-DEFAULT). Its name depends on the
  # generated runtime ID: the custom resource creates it (or adopts it if the
  # service already created it), sets retention and deletes it on delete.
  RuntimeLogGroup:
    Type: Custom::RuntimeLogGroup
    Properties:
      ServiceToken:    !GetAtt CustomResourceFunction.Arn
      Action:          RuntimeLogGroup
      LogGroupName:    !Sub "/aws/bedrock-agentcore/runtimes/${AgentCoreRuntime.AgentRuntimeId}-DEFAULT"
      RetentionInDays: !Ref LogRetentionInDays

  # ── Proxy Lambda: logs ────────────────────────────────────────────────────────
  ProxyLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName:    !Sub "/aws/lambda/iam-policy-proxy-${AWS::StackName}"
      RetentionInDays: !Ref LogRetentionInDays

  # ── IAM: proxy Lambda role ───────────────────────────────────────────────────
  ProxyLambdaRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "iam-policy-proxy-role-${AWS::StackName}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        # No logs:CreateLogGroup: the Lambda only writes to the stack's log group.
        - PolicyName: ProxyLogs
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !GetAtt ProxyLogGroup.Arn
        - PolicyName: InvokeAgentCoreRuntime
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid:    InvokeRuntime
                Effect: Allow
                Action:
                  - bedrock-agentcore:InvokeAgentRuntime
                Resource:
                  - !GetAtt AgentCoreRuntime.AgentRuntimeArn
                  - !Sub
                    - "${RuntimeArn}/runtime-endpoint/*"
                    - RuntimeArn: !GetAtt AgentCoreRuntime.AgentRuntimeArn
      Tags:
        - Key:   Project
          Value: iam-policy-agent

  # ── Proxy Lambda: API Gateway → AgentCore Runtime ─────────────────────────────
  ProxyFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName:  !Sub "iam-policy-proxy-${AWS::StackName}"
      CodeUri:       ./proxy/
      Handler:       proxy_handler.lambda_handler
      Runtime:       python3.14
      Architectures: [arm64]
      Timeout:       300
      MemorySize:    256
      Role:          !GetAtt ProxyLambdaRole.Arn
      Description:   "Proxy Lambda between API Gateway and AgentCore Runtime"
      LoggingConfig:
        LogGroup:  !Ref ProxyLogGroup
        LogFormat: Text
      Environment:
        Variables:
          AGENT_RUNTIME_ARN: !GetAtt AgentCoreRuntime.AgentRuntimeArn
      Events:
        GeneratePolicy:
          Type: HttpApi
          Properties:
            ApiId: !Ref PortalApi
            Path:  /generate-policy
            Method: POST
      Tags:
        Project: iam-policy-agent


# ─── Outputs ───────────────────────────────────────────────────────────────────
Outputs:

  UserPoolId:
    Description: "User Pool ID → VITE_COGNITO_USER_POOL_ID"
    Value:       !Ref UserPool

  UserPoolClientId:
    Description: "App Client ID → VITE_COGNITO_CLIENT_ID"
    Value:       !Ref UserPoolClient

  ChatApiUrl:
    Description: "Chat endpoint → VITE_CHAT_API_URL"
    Value:       !Sub "https://${PortalApi}.execute-api.${AWS::Region}.amazonaws.com/knowledge-base/chat"

  GeneratePolicyUrl:
    Description: "IAM policies endpoint → VITE_POLICY_API_URL"
    Value:       !Sub "https://${PortalApi}.execute-api.${AWS::Region}.amazonaws.com/generate-policy"

  KnowledgeBaseId:
    Description: "ID of the managed knowledge base"
    Value:       !Ref KnowledgeBase

  KnowledgeDataSourceId:
    Description: "ID of the S3 data source"
    Value:       !Ref KnowledgeDataSource

  GatewayUrl:
    Description: "MCP URL of the Gateway"
    Value:       !GetAtt Gateway.GatewayUrl

  HarnessArn:
    Description: "ARN of the AgentCore Harness"
    Value:       !GetAtt Harness.Arn

  KnowledgeDocsBucketName:
    Description: "Bucket where the knowledge base documents are uploaded"
    Value:       !Ref KnowledgeDocsBucket

  PoliciesBucketName:
    Description: "S3 bucket with the generated IAM policies"
    Value:       !Ref PoliciesBucket

  AgentCoreRuntimeArn:
    Description: "ARN of the AgentCore Runtime"
    Value:       !GetAtt AgentCoreRuntime.AgentRuntimeArn

  AgentRuntimeLogGroup:
    Description: "Runtime log group (DEFAULT endpoint)"
    Value:       !Ref RuntimeLogGroup
````

#### `infra/samconfig.toml`

````toml
version = 0.1

[default.global.parameters]
# A single stack for the whole project
stack_name = "skeleton-crew"
region = "us-east-1"

[default.build.parameters]
cached = true
parallel = true

[default.deploy.parameters]
s3_prefix = "skeleton-crew"
# Prior authorization is requested in Kiro; here CloudFormation does not ask again
confirm_changeset = false
capabilities = ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"]
# If it fails, leave the stack in the error state so it can be diagnosed
disable_rollback = true
# SAM creates and manages the artifacts bucket (stack aws-sam-cli-managed-default)
resolve_s3 = true
tags = [
  "Project=kiroween-2026",
  "ManagedBy=SAM"
]
````
