import type { Metadata } from "next";
import { LegalLayout, H } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Termos de Serviço · DashMonster",
  description: "Termos de uso da plataforma DashMonster.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Termos de Serviço" updated="17 de julho de 2026">
      <p>
        Estes Termos regem o uso da plataforma <strong>DashMonster</strong>, operada por
        GSAStúdio. Ao criar uma conta ou usar o serviço, você concorda com eles.
      </p>

      <H>1. O serviço</H>
      <p>
        O DashMonster oferece análise de campanhas de mídia paga (Meta Ads), rastreamento de
        conversões e um CRM para gestão de leads e negócios. O serviço é destinado a empresas e
        agências no uso das suas próprias contas e dados.
      </p>

      <H>2. Conta e responsabilidade</H>
      <p>
        Você é responsável por manter suas credenciais em segurança e por toda atividade na sua conta.
        Ao conectar contas de terceiros (Meta, Instagram, WhatsApp), você declara ter autorização para
        acessar e tratar esses dados.
      </p>

      <H>3. Uso aceitável</H>
      <p>Você concorda em não usar o serviço para fins ilegais, para enviar spam, violar direitos de terceiros, ou contornar limites técnicos e de segurança da plataforma ou das APIs da Meta.</p>

      <H>4. Dados dos seus contatos</H>
      <p>
        Em relação aos dados de leads e clientes que você insere ou coleta, <strong>você é o
        controlador</strong> e nós atuamos como operador. Você é responsável por ter base legal para
        tratar esses dados e por atender às solicitações dos titulares.
      </p>

      <H>5. Disponibilidade</H>
      <p>O serviço é fornecido &quot;como está&quot;. Empenhamo-nos por alta disponibilidade, mas não garantimos operação ininterrupta ou livre de erros.</p>

      <H>6. Encerramento</H>
      <p>
        Você pode encerrar sua conta a qualquer momento. Ao encerrar, os dados de negócio da sua
        empresa podem ser exportados e, mediante solicitação, excluídos (ver{" "}
        <a href="/data-deletion" className="underline">Exclusão de Dados</a>).
      </p>

      <H>7. Limitação de responsabilidade</H>
      <p>Na máxima extensão permitida em lei, não respondemos por danos indiretos, lucros cessantes ou perda de dados decorrentes do uso do serviço.</p>

      <H>8. Contato</H>
      <p>
        Dúvidas sobre estes Termos:{" "}
        <a href="mailto:contato@dashmonster.com.br" className="underline">contato@dashmonster.com.br</a>.
      </p>
    </LegalLayout>
  );
}
