import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { genSaltSync, hashSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { mailHelper } from '../../helpers/mail.helper';
import { RegisterUserDto } from '../auth/dto/register.dto';
import { MailService } from '../mail/mail.service';
import { CreateOrUpdateUserResponseDto } from './dto/create-update-user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async findById(id: string): Promise<UserEntity> {
    const possibleUser = await this.usersRepository.findById(id);

    return plainToInstance(UserEntity, possibleUser, {
      excludeExtraneousValues: true,
    });
  }

  async findByEmail(email: string): Promise<UserEntity> {
    const possibleUser = await this.usersRepository.findByEmail(email);

    return plainToInstance(UserEntity, possibleUser, {
      excludeExtraneousValues: true,
    });
  }

  async findByEmailWithSensitiveData(email: string): Promise<UserEntity> {
    const possibleUser = await this.usersRepository.findByEmail(email);

    return possibleUser;
  }

  async getExistentById(id: string): Promise<UserEntity> {
    const possibleUser = await this.findById(id);

    if (!possibleUser) throw new NotFoundException('User not found!');

    return possibleUser;
  }

  async create(
    createUserDto: RegisterUserDto,
  ): Promise<CreateOrUpdateUserResponseDto> {
    const possibleUser = await this.findByEmail(createUserDto.email);

    if (possibleUser) throw new BadRequestException('Email already in use!');

    const salt = genSaltSync(10);
    const hash = hashSync(createUserDto.password, salt);

    const newUserData: RegisterUserDto = { ...createUserDto, password: hash };

    const createdUser = await this.usersRepository.create(newUserData);

    const createResponse = plainToInstance(
      CreateOrUpdateUserResponseDto,
      createdUser,
      {
        excludeExtraneousValues: true,
      },
    );

    return createResponse;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<CreateOrUpdateUserResponseDto> {
    const currentUser = await this.getExistentById(id);

    Object.entries(updateUserDto).map(([key, value]) => {
      if (!key) return;
      currentUser[key] = value;
    });

    const updatedUser = await this.usersRepository.updateById(id, currentUser);

    const updateResponse = plainToInstance(
      CreateOrUpdateUserResponseDto,
      updatedUser,
      {
        excludeExtraneousValues: true,
      },
    );

    return updateResponse;
  }

  async confirmEmail(
    id: string,
    token: string,
  ): Promise<CreateOrUpdateUserResponseDto> {
    const user = await this.getExistentById(id);

    if (user.emailStatus === 'VERIFIED')
      throw new BadRequestException('Email already verified!');

    if (user.emailStatus === 'UNVERIFIED')
      throw new BadRequestException('Confirmation token invalid!');

    const decodedToken = this.jwtService.verify(token, {
      ignoreExpiration: true,
    });

    if (!decodedToken)
      throw new BadRequestException('Confirmation token invalid! a');

    if (decodedToken.id !== user.id)
      throw new BadRequestException('Confirmation token invalid! b');
    if (decodedToken.email !== user.email)
      throw new BadRequestException('Confirmation token invalid! c');
    if (
      new Date(decodedToken.createdAt).toISOString() !==
      new Date(user.createdAt).toISOString()
    )
      throw new BadRequestException('Confirmation token invalid! d');

    const updatedUser = await this.update(id, { emailStatus: 'VERIFIED' });

    return updatedUser;
  }

  async sendConfirmationEmail(id: string): Promise<void> {
    const user = await this.getExistentById(id);

    if (user.emailStatus === 'VERIFIED')
      throw new BadRequestException('Email already verified!');

    const token = this.jwtService.sign({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });

    const url = `${mailHelper.projectUrl}/users/${id}/email/confirm/${token}`;

    await this.mailService.sendConfirmAccountMail({
      confirmationUrl: url,
      to: [{ email: user.email, name: user.name }],
    });

    await this.update(id, { emailStatus: 'PENDING' });
  }

  async delete(id: string): Promise<void> {
    await this.getExistentById(id);

    await this.usersRepository.deleteById(id);
  }
}
