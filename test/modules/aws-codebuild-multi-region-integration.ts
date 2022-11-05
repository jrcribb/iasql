import * as iasql from '../../src/services/iasql';
import {
  defaultRegion,
  execComposeDown,
  execComposeUp,
  finish,
  runApply,
  runInstall,
  runQuery,
  runSync,
} from '../helpers';

const dbAlias = 'codebuildtest';
const apply = runApply.bind(null, dbAlias);
const install = runInstall.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);
const sync = runSync.bind(null, dbAlias);
const region = defaultRegion();
const modules = ['aws_codebuild', 'aws_ecr'];
const nonDefaultRegion = 'us-east-1';

const codebuildPolicyArn = 'arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess';
const cloudwatchLogsArn = 'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess';
const pushEcrPolicyArn = 'arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess';
const assumeServicePolicy = JSON.stringify({
  Statement: [
    {
      Effect: 'Allow',
      Principal: {
        Service: 'codebuild.amazonaws.com',
      },
      Action: 'sts:AssumeRole',
    },
  ],
  Version: '2012-10-17',
});
const ghUrl = 'https://github.com/iasql/iasql-engine';

jest.setTimeout(360000);
beforeAll(async () => await execComposeUp());
afterAll(async () => await execComposeDown());

describe('AwsCodebuild Multi-region Integration Testing', () => {
  it('creates a new test db with the same name', done =>
    void iasql.connect(dbAlias, 'not-needed', 'not-needed').then(...finish(done)));

  it('installs the aws_account module', install(['aws_account']));

  it(
    'inserts aws credentials',
    query(
      `
    INSERT INTO aws_credentials (access_key_id, secret_access_key)
    VALUES ('${process.env.AWS_ACCESS_KEY_ID}', '${process.env.AWS_SECRET_ACCESS_KEY}')
  `,
      undefined,
      false,
    ),
  );

  it('syncs the regions', sync());

  it(
    'sets the default region',
    query(`
    UPDATE aws_regions SET is_default = TRUE WHERE region = '${region}';
  `),
  );

  it('installs the codebuild module', install(modules));

  it(
    'adds a new source_credentials_import',
    query(
      `
    INSERT INTO source_credentials_import (token, source_type, auth_type, region)
    VALUES ('${process.env.GH_PAT}', 'GITHUB', 'PERSONAL_ACCESS_TOKEN', '${nonDefaultRegion}')
  `,
      undefined,
      false,
    ),
  );

  it('apply import', apply());

  it(
    'check source_credentials_import is empty',
    query(
      `
    SELECT *
    FROM source_credentials_import
    WHERE source_type = 'GITHUB' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check new source_credentials_list',
    query(
      `
    SELECT *
    FROM source_credentials_list
    WHERE source_type = 'GITHUB' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'delete source_credentials_list',
    query(`
    DELETE FROM source_credentials_list
    WHERE source_type = 'GITHUB' and region = '${nonDefaultRegion}';
  `),
  );

  it('apply delete', apply());

  it(
    'check source_credentials_list is empty',
    query(
      `
    SELECT *
    FROM source_credentials_list
    WHERE source_type = 'GITHUB' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'adds a new role',
    query(`
    INSERT INTO iam_role (role_name, assume_role_policy_document, attached_policies_arns)
    VALUES ('${dbAlias}', '${assumeServicePolicy}', array['${codebuildPolicyArn}', '${cloudwatchLogsArn}', '${pushEcrPolicyArn}']);
  `),
  );

  it(
    'adds a new codebuild_project',
    query(`
    INSERT INTO codebuild_project (project_name, source_type, service_role_name, source_location, region)
    VALUES ('${dbAlias}', 'GITHUB', '${dbAlias}', '${ghUrl}', '${nonDefaultRegion}');
  `),
  );

  it('apply codebuild_project creation', apply());

  it(
    'start build',
    query(`
    INSERT INTO codebuild_build_import (project_name, region)
    VALUES ('${dbAlias}', '${nonDefaultRegion}');
  `),
  );

  it('apply build start', apply());

  it(
    'check build imports is empty',
    query(
      `
    SELECT * FROM codebuild_build_import
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check build exists in list',
    query(
      `
    SELECT * FROM codebuild_build_list
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(1),
    ),
  );

  it(
    'delete build',
    query(`
    DELETE FROM codebuild_build_list
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `),
  );

  it(
    'delete project',
    query(`
    DELETE FROM codebuild_project
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `),
  );

  it(
    'delete role',
    query(`
    DELETE FROM iam_role
    WHERE role_name = '${dbAlias}';
  `),
  );

  it('apply deletions', apply());

  it(
    'check build list is empty',
    query(
      `
    SELECT * FROM codebuild_build_list
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check role is empty',
    query(
      `
    SELECT *
    FROM iam_role
    WHERE role_name = '${dbAlias}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it(
    'check codebuild_project is empty',
    query(
      `
    SELECT *
    FROM codebuild_project
    WHERE project_name = '${dbAlias}' and region = '${nonDefaultRegion}';
  `,
      (res: any[]) => expect(res.length).toBe(0),
    ),
  );

  it('deletes the test db', done => void iasql.disconnect(dbAlias, 'not-needed').then(...finish(done)));
});