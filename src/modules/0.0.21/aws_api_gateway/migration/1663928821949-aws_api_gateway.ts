import { MigrationInterface, QueryRunner } from 'typeorm';

export class awsApiGateway1663928821949 implements MigrationInterface {
  name = 'awsApiGateway1663928821949';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."api_protocol_type_enum" AS ENUM('HTTP', 'WEBSOCKET')`);
    await queryRunner.query(
      `CREATE TABLE "api" ("id" SERIAL NOT NULL, "api_id" character varying, "name" character varying, "description" character varying, "disable_execute_api_endpoint" boolean, "protocol_type" "public"."api_protocol_type_enum", "version" character varying, "region" character varying NOT NULL DEFAULT default_aws_region(), CONSTRAINT "PK_12f6cbe9e79197c2bf4c79c009d" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api"`);
    await queryRunner.query(`DROP TYPE "public"."api_protocol_type_enum"`);
  }
}