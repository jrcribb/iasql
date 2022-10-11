import * as iasql from '../../src/services/iasql'
import { getPrefix, runQuery, runApply, runInstall, finish, execComposeUp, execComposeDown, runSync, } from '../helpers'

const prefix = getPrefix();
const dbAlias = 'rdstest';
const parameterGroupName = `${prefix}${dbAlias}pg`;
const engineFamily = `postgres13`;

const apply = runApply.bind(null, dbAlias);
const sync = runSync.bind(null, dbAlias);
const query = runQuery.bind(null, dbAlias);
const install = runInstall.bind(null, dbAlias);
const modules = ['aws_security_group', 'aws_rds', 'aws_vpc'];

jest.setTimeout(960000);
beforeAll(async () => await execComposeUp());
afterAll(async () => await execComposeDown());

describe('RDS Multi-Region Testing', () => {
  it('creates a new test db elb', (done) => void iasql.connect(
    dbAlias,
    'not-needed', 'not-needed').then(...finish(done)));

  it('installs the aws_account module', install(['aws_account']));

  it('inserts aws credentials', query(`
    INSERT INTO aws_credentials (access_key_id, secret_access_key)
    VALUES ('${process.env.AWS_ACCESS_KEY_ID}', '${process.env.AWS_SECRET_ACCESS_KEY}')
  `, undefined, false));

  it('syncs the regions', sync());

  it('sets the default region', query(`
    UPDATE aws_regions SET is_default = TRUE WHERE region = '${process.env.AWS_REGION}';
  `));

  it('installs the rds module', install(modules));

  it('creates an RDS instance', query(`
    BEGIN;
      INSERT INTO rds (db_instance_identifier, allocated_storage, db_instance_class, master_username, master_user_password, availability_zone, engine, backup_retention_period)
        VALUES ('${prefix}test', 20, 'db.t3.micro', 'test', 'testpass', (SELECT name FROM availability_zone WHERE region = '${process.env.AWS_REGION}' LIMIT 1), 'postgres:13.4', 0);
      INSERT INTO rds_security_groups (rds_id, security_group_id) SELECT
        (SELECT id FROM rds WHERE db_instance_identifier='${prefix}test'),
        (SELECT id FROM security_group WHERE group_name='default' AND region = '${process.env.AWS_REGION}');
    COMMIT;
  `));

  it('applies the change', apply());

  it('creates an RDS parameter group', query(`
    INSERT INTO parameter_group (name, family, description)
    VALUES ('${parameterGroupName}', '${engineFamily}', '${parameterGroupName} desc');
  `));

  it('applies the change', apply());

  it('moves the parameter group to another region', query(`
    UPDATE parameter_group SET region = 'us-east-1' WHERE name = '${parameterGroupName}';
  `));

  it('updates the RDS instance to use the parameter group and moves it to another region', query(`
    UPDATE rds SET
      region = 'us-east-1',
      availability_zone = (SELECT name FROM availability_zone WHERE region = 'us-east-1' LIMIT 1),
      master_user_password = 'testpass',
      parameter_group_id = (
        SELECT id FROM parameter_group WHERE name = '${parameterGroupName}'
      )
    WHERE db_instance_identifier = '${prefix}test';
    UPDATE rds_security_groups SET
      security_group_id = (SELECT id FROM security_group WHERE group_name='default' AND region = 'us-east-1')
    WHERE rds_id = (SELECT id FROM rds WHERE db_instance_identifier='${prefix}test');
  `));

  it('applies the region move and parameter group usage', apply());

  it('removes the RDS instance', query(`
    DELETE FROM rds
    WHERE db_instance_identifier = '${prefix}test';
  `));

  it('applies the change', apply());

  it('removes the parameter group and it parameters', query(`
    DELETE FROM parameter_group
    WHERE name = '${parameterGroupName}';
  `));

  it('applies the change', apply());

  it('deletes the test db', (done) => void iasql
    .disconnect(dbAlias, 'not-needed')
    .then(...finish(done)));
});